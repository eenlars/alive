# Worker Pool Process Leak — Production Outage

**Date:** 2026-02-06 ~15:30 CET
**Severity:** High (production unresponsive for several minutes)
**Status:** Mitigated manually, root cause NOT fixed
**Affected systems:** `claude-bridge-production` (port 9000, `app.alive.best`)

---

## Symptoms

1. Production chat was extremely slow — messages took **171 seconds** to get a first token (normally <3s)
2. Responses came back essentially empty (1 output token)
3. Repeated messages from user ("what were the last messages of me, and you?") went unanswered or returned empty
4. Server load average hit **30 on 8 cores** (3.75x overloaded)
5. 6.2 GB swap in use (memory pressure)

## Timeline

| Time | Event |
|------|-------|
| ~15:22 | First orphaned SDK worker spawned (PID 3072231, session `9a1d73ef`) |
| ~15:25 | Second orphaned worker spawned (PID 3084041, no `--resume`, same session) |
| ~15:39 | User sends messages on two tabs — 4 more workers spawned (PIDs 3149506, 3149540, 3149506, 3149540) |
| ~15:39 | Two `tsc --noEmit` processes spawned by a Claude worker running `npx tsc` via Bash tool |
| ~15:43 | User navigates away (`beforeunload` beacon), cancellation fires for tab `10f791f9` |
| ~15:43 | Cancel succeeds, but worker process (PID 3084041) enters `Dl` state (uninterruptible I/O sleep) |
| ~15:44 | Stale lock detected and auto-cleaned (held 325s > 300s timeout) |
| ~15:44 | `Controller is already closed` error — stream route tries to write to closed ReadableStream controller |
| ~15:45 | More SDK workers spawned for new requests — total reaches **7 simultaneous SDK CLI processes** |
| ~15:47 | Manual investigation begins |
| ~15:49 | `tsc` processes killed (2 processes) — immediate CPU relief |
| ~15:51 | 5 orphaned SDK workers killed with `kill -9` (SIGTERM didn't work due to `Dl` state) |
| ~15:52 | Load drops from 30 → 4.2 over next 2 minutes |
| ~15:53 | User's request (4f78233f) finally completes: `first_sdk_message: +171446ms` — 171 seconds to first token |

## Root Cause Analysis

### The Core Bug: Worker Pool Spawns New CLI Processes Without Killing Old Ones

The worker pool (`packages/worker-pool/src/manager.ts`) manages **parent worker processes** that communicate via Unix sockets. Each parent worker spawns a **child `bun claude-agent-sdk/cli.js` process** for each query via the `query()` function in `@anthropic-ai/claude-agent-sdk`.

**The problem:** When a request is cancelled (user navigates away, clicks Stop, or sends a new message), the cancellation flow is:

1. `abortHandler` in `manager.ts:270` fires
2. Sends `{ type: "cancel", requestId }` to the worker via IPC
3. Worker receives cancel in `worker-entry.mjs:798` → calls `currentAbortController.abort()`
4. Worker clears `currentRequestId` and `currentAbortController`
5. The `for await (const message of agentQuery)` loop in `handleQuery()` breaks

**But:** The underlying `bun claude-agent-sdk/cli.js` child process that was spawned by `query()` from `@anthropic-ai/claude-agent-sdk` **does not always exit**. It can get stuck in:
- An active Anthropic API call that doesn't respect the abort signal
- MCP server initialization (7 MCP servers: alive-workspace, alive-tools, context7, google-scraper, ocr, github, gmail)
- `Dl` state (uninterruptible disk I/O sleep in the kernel — immune to SIGTERM)

When the worker is marked as "ready" again after `cancelTimeoutMs` (500ms), the **next request spawns a NEW `bun claude-agent-sdk/cli.js` process** via `query()`. The old child process is still alive, consuming CPU and memory.

### The Cascade

Here's how 2 sessions turned into 7 SDK processes:

```
Session 9a1d73ef (tab c812fffd):
  Request 1 → spawns CLI process (PID 3072231, no --resume)     → gets cancelled → process stuck in Dl
  Request 2 → spawns CLI process (PID 3084041, no --resume)     → gets cancelled → process stuck in Dl
  Request 3 → spawns CLI process (PID 3149540, --resume 9a1d)   → gets cancelled → process stuck in Dl
  Request 4 → spawns CLI process (PID 3191837, --resume 9a1d)   → active (latest)

Session f1d7511c (tab 10f791f9):
  Request 1 → spawns CLI process (PID 3149506, --resume f1d7)   → gets cancelled → process stuck in Dl
  Request 2 → spawns CLI process (PID 3187364, --resume f1d7)   → gets cancelled → process stuck in Dl
  Request 3 → spawns CLI process (PID 3206557, --resume f1d7)   → active (latest)
```

Each stuck process consumes **150-400 MB RSS** and **3-7% CPU**. With 7 processes, that's ~1.8 GB RAM and ~35% CPU just from orphaned SDK workers.

### Compounding Factor: `tsc --noEmit` Spawned by Claude

One of the Claude workers used the Bash tool to run `npx tsc --noEmit --project apps/web/tsconfig.json`. This spawned TWO TypeScript compiler processes (one via `npx`, one via `npm exec`), each consuming 5%+ CPU and 300+ MB RAM on the full monorepo type-check.

### Compounding Factor: Dev Server Running

The `claude-bridge-dev` service was also running simultaneously, consuming 2.6 GB RAM with `next dev --turbo` on port 8997.

### Total Resource Impact

| Process | Count | CPU% (combined) | RAM (combined) |
|---------|-------|-----------------|----------------|
| Orphaned SDK workers | 5 | ~25% | ~1.2 GB |
| Active SDK workers | 2 | ~12% | ~600 MB |
| `tsc --noEmit` | 2 | ~10% | ~600 MB |
| `claude` CLI (terminal sessions) | 2 | ~46% | ~1.1 GB |
| Dev server (`next dev --turbo`) | 1 | ~3% | ~2.6 GB |
| Production server | 1 | ~3% | ~130 MB |
| **Total** | **13** | **~99%** (of 800%) | **~6.2 GB** |

With 8 cores at 100% and 6.2 GB swap, the system was thrashing. API calls to Anthropic were timing out or taking minutes. New requests piled up, spawning more workers, making it worse.

## Files Involved

### `packages/worker-pool/src/manager.ts` — The Worker Pool Manager

- **Lines 258-348**: The `query()` method's Promise handler. When abort fires (`abortHandler`, line 270), it sends a cancel IPC message and resolves the Promise immediately. A `cancelTimeout` (500ms) then resets the worker to `ready` state.
- **Lines 290-307**: The cancel timeout — after 500ms, if the worker is still busy, it force-resets to "ready". This is where the **assumption breaks**: the worker process reports "ready" but its child CLI process is still running.
- **Key issue**: `worker.state = "ready"` at line 303 doesn't verify the old CLI subprocess actually exited.

### `packages/worker-pool/src/worker-entry.mjs` — The Worker Process

- **Lines 798-807**: `handleCancel()` — calls `currentAbortController.abort()` and clears state. The worker becomes available for new queries.
- **Lines 665-683**: `query()` from `@anthropic-ai/claude-agent-sdk` — this spawns a `bun claude-agent-sdk/cli.js` subprocess. The abort signal is passed as `abortSignal`, but the CLI subprocess may not respond to it if it's stuck in an API call or MCP initialization.
- **Lines 687-738**: The `for await` loop — when aborted, breaks out, but the underlying CLI process may keep running.

### `packages/worker-pool/src/config.ts` — Pool Configuration

- **Line 36**: `cancelTimeoutMs: WORKER_POOL.CANCEL_TIMEOUT_MS` (500ms) — too short for a graceful CLI process cleanup, but intentionally short for UX ("users shouldn't wait long after clicking Stop").

### `packages/shared/src/constants.ts` — Constants

- **Lines 113-142**: `WORKER_POOL` configuration:
  - `MAX_WORKERS: 20` — allows up to 20 worker slots, but doesn't limit CLI subprocesses per worker
  - `CANCEL_TIMEOUT_MS: 500` — after 500ms, worker is force-marked as "ready" regardless of CLI process state
  - `INACTIVITY_TIMEOUT_MS: 15 * 60 * 1000` — idle workers evicted after 15 minutes (but CLI subprocesses aren't tracked)

### Stream Route (`apps/web/app/api/claude/stream/route.ts`)

- Detects cancel via `beforeunload` beacon or explicit Stop button
- Fires abort signal → worker pool's `abortHandler` fires
- Logs `Controller is already closed` when trying to write to an already-finalized SSE stream (a symptom, not the cause)

## Why SIGTERM Didn't Work

All 5 orphaned SDK processes were in `Dl` state:
- `D` = uninterruptible sleep (typically waiting for I/O)
- `l` = multi-threaded

Processes in `D` state **cannot be interrupted by signals** — they must complete their I/O operation first. This happens when:
- The process is waiting on a socket read/write to the Anthropic API
- The process is in a system call that can't be interrupted (e.g., disk I/O, network I/O in kernel space)
- MCP HTTP connections are stuck in kernel-level socket operations

Only `SIGKILL` (`kill -9`) works because it's handled by the kernel directly, not delivered to the process.

## Mitigation Applied

1. Killed 2 `tsc --noEmit` processes (regular `kill`)
2. Killed 5 orphaned SDK CLI processes with `kill -9` (SIGKILL required due to `Dl` state)
3. Load dropped from 30 → 4.2 within 2 minutes
4. Production became responsive again

## Proposed Fixes (Not Yet Implemented)

### Fix 1: Track and Kill CLI Subprocesses on Cancel (Critical)

The worker pool should track the PID of the CLI subprocess spawned by `query()` and explicitly kill it during cancellation. Currently, only the logical state is reset — the physical process is orphaned.

```
// Conceptual fix in worker-entry.mjs handleCancel():
// 1. Track the CLI subprocess PID when query() spawns it
// 2. On cancel, kill the subprocess directly (SIGKILL if needed)
// 3. Only report "ready" after subprocess actually exits
```

### Fix 2: Process Reaper / Orphan Detector (Safety Net)

A periodic check in `manager.ts` that:
1. Lists all child processes of each worker
2. Kills any that have been running longer than a threshold (e.g., 5 minutes without activity)
3. Logs when orphans are detected for monitoring

### Fix 3: Limit CLI Processes Per Worker

Currently `MAX_WORKERS: 20` limits worker pool slots, but nothing limits how many CLI subprocesses a single worker can accumulate. A hard limit (e.g., kill old subprocess before spawning new one) would prevent the cascade.

### Fix 4: Prevent Heavy Commands in Claude Workers

The `tsc --noEmit` processes were spawned because Claude used the Bash tool to run type-checking on the full monorepo. Consider:
- Adding resource limits (timeout, memory) to Bash tool invocations
- Blocking known-heavy commands (tsc, turbo, next build) in non-superadmin workspaces
- Using `cgroup` limits for worker child processes

## Lessons Learned

1. **Process pools need process-level tracking, not just logical state tracking.** The worker pool tracks worker *state* (ready/busy/dead) but not the actual subprocess tree. When state resets but processes don't die, you get orphan accumulation.

2. **Processes in `D` state are immune to SIGTERM.** Always use SIGKILL as a fallback after a timeout when killing processes that may be stuck in I/O.

3. **Cancel timeouts (500ms) that reset state without verifying process exit create a "spawn storm" pattern.** Each cancel-and-reset cycle allows a new process to spawn while the old one is still alive.

4. **Compounding effects are the real killer.** No single issue caused the outage — it was the combination of orphaned SDK workers + tsc processes + dev server + terminal sessions all competing for 8 cores.

5. **Load average > 2x cores = everything gets slower, including the cleanup mechanisms.** Once the system was overloaded, even the cancel/timeout mechanisms slowed down, making the situation worse.
