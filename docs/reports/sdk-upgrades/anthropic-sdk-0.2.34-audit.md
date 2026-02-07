# Anthropic SDK 0.2.34 Upgrade Audit

## 1) Version Baseline Capture
- Baseline branch lockfile resolved SDK (pre-change): `@anthropic-ai/claude-agent-sdk@0.1.60` (from `HEAD:bun.lock`)
- Baseline manifest ranges (pre-change):
  - `/Users/here/.codex/worktrees/61f8/alive/package.json`: `^0.1.53`
  - `/Users/here/.codex/worktrees/61f8/alive/apps/web/package.json`: `^0.1.53`
  - `/Users/here/.codex/worktrees/61f8/alive/packages/tools/package.json`: `^0.1.53`
  - `/Users/here/.codex/worktrees/61f8/alive/packages/worker-pool/package.json`: `^0.1.53`
- Target: `0.2.34`
- Current lockfile resolved SDK (post-change): `@anthropic-ai/claude-agent-sdk@0.2.34`
- SDK peer dep shift confirmed: zod moved from `^3.24.1` to `^4.0.0`.

## 2) Changelog Diff Review (0.1.61 -> 0.2.34)
High/medium relevance items:
- Added safety requirement around bypass permissions behavior in options API (`allowDangerouslySkipPermissions` requirement when bypassing permissions).
- Tool schema and inventory evolved (`TaskStopInput` present; `KillShellInput` removed).
- Hooks/events expanded: `Setup`, `TaskCompleted`, `TeammateIdle`.
- Query API and options expanded (debug, sessionId, sandbox-related and others).

Low relevance / optional features:
- Dynamic MCP management helpers, extra status fields.
- Structured output and debugging quality improvements.
- Additional task-system and compacting related features not used directly here.

## 3) API Surface Diff (Types)
Artifacts:
- Tool input diff CSV: `/Users/here/.codex/worktrees/61f8/alive/docs/reports/sdk-upgrades/anthropic-sdk-0.2.34-tool-input-diff.csv`
- Impact matrix CSV: `/Users/here/.codex/worktrees/61f8/alive/docs/reports/sdk-upgrades/anthropic-sdk-0.2.34-impact-matrix.csv`

Observed critical type deltas that impact this repo:
- Removed: `KillShellInput`
- Added: `TaskStopInput`
- Permission mode union now includes `delegate` (non-breaking in current code)
- Options shape expanded (non-breaking for current callsites)

## 4) Repo Impact Mapping
See full matrix CSV for per-delta mapping, severity, required action, and test coverage.

## 5) Gate Decision
Gate status: **PASS**
- All high/medium deltas are mapped to concrete code changes and tests.
- No unmapped high-severity delta remains.

## 6) Verification Results
Executed:
- `bun run type-check` ✅ pass
- `bun run --filter @webalive/tools test` ✅ pass (139 tests)
- `cd /Users/here/.codex/worktrees/61f8/alive/apps/web && bun run test -- sdk-tools-sync` ✅ pass (16 tests)
- `bun run --filter @webalive/worker-pool test` ⚠️ fails in this environment due Unix socket listen failures in cancellation/lifecycle integration suites (`Failed to listen at .../worker.sock`), not SDK type/API regression.
- `CI=true bun run --filter @webalive/worker-pool test` ⚠️ same integration socket failures; manager/import-order/session-cookie/hardening suites pass.

Runtime smoke:
- Local runner path (`apps/web/scripts/run-agent.mjs`) with `permissionMode: "bypassPermissions"` ✅ pass; returned `smoke-ok`.
- Worker-pool path (`getWorkerPool().query(...)`) with `permissionMode: "bypassPermissions"` ✅ pass; session and complete messages observed.

## 7) Residual Risks
- Worker-pool cancellation/lifecycle integration tests are currently unstable in this local environment due socket bind errors; SDK migration correctness is validated by type-check + focused suites + runtime smoke, but full worker-pool integration green remains pending environment-specific test stability.
