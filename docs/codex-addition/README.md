# Codex Addition — Multi-Agent Provider Support for Alive

## Goal
Add Codex (OpenAI) as a second coding agent provider alongside Claude Code. Users should be able to switch between Claude and Codex per workspace or per query.

## Status
**Planning phase** — iterating every 4 hours until Thursday Feb 20.

## Architecture Overview
Current: `worker-entry.mjs` imports `@anthropic-ai/claude-agent-sdk` directly. Everything is Claude-specific.

Target: Abstract the agent layer so the worker can spawn either Claude or Codex (or future providers) based on workspace config.

## Phases
- **Fase 1**: Research & architecture — understand both SDKs, map differences, design abstraction
- **Fase 2**: Implementation plan — exact files to change, new files to create, migration path
- **Fase 3**: Testing & rollout — how to test, feature flags, gradual rollout

## Key Files (current Claude integration)
- `packages/worker-pool/src/worker-entry.mjs` — main worker, imports claude-agent-sdk
- `packages/worker-pool/src/manager.ts` — spawns workers, manages pool
- `packages/worker-pool/src/types.ts` — type definitions
- `packages/worker-pool/package.json` — depends on `@anthropic-ai/claude-agent-sdk`
- `packages/shared/` — tool context, permission logic, defaults

## Open Questions (to resolve during planning)
- ~~Does Codex have a Node SDK or only CLI?~~ ✅ Yes — `@openai/codex-sdk` (TypeScript)
- ~~How does Codex handle tools/MCP?~~ ✅ Full MCP support — `config.toml` `[mcp_servers]`, stdio + HTTP transports, OAuth, `codex mcp` CLI subcommand
- ~~How does Codex handle sessions/resume?~~ ✅ Thread-based — `startThread()` / `resumeThread(threadId)`
- ~~Can both run in the same worker process or need separate workers?~~ ✅ Same worker — Codex SDK spawns CLI as child process, doesn't conflict with Claude in-process
- ~~How to handle auth (API keys) per provider?~~ ✅ Server-only API keys (consistent with current auth model — no user-supplied keys). Codex API key managed server-side, passed via IPC payload
- ~~How does the frontend switch between providers?~~ ✅ Workspace settings provider selector, per-stream override possible

## Resolved Questions
- **MCP server refactoring needed**: Alive's internal MCP servers (workspace, tools, email) currently use `createSdkMcpServer()` which creates in-process function objects. These must be refactored to standalone stdio processes so both Claude and Codex can use them.
- **Approval model difference**: Claude uses `canUseTool` callback (sync). Codex uses `approvalPolicy` + approval request/response (async). For Alive, map `bypassPermissions` → Codex `never` (auto-approve), `plan` → `read-only` sandbox.
- **Process model**: Claude runs in-process. Codex spawns CLI subprocess. Both work within Alive's worker architecture — the worker just becomes a manager of either an in-process SDK or a child process.

## Remaining Open Questions
- ~~How to handle billing/usage display when user switches providers mid-conversation?~~ ✅ Track per-provider, display total for v1 (fase_2/05)
- ~~Should MCP server refactoring happen before or in parallel with provider abstraction?~~ ✅ BEFORE — it's the blocker (fase_2/06)
- ~~Performance comparison: Claude in-process vs Codex subprocess — any latency concerns?~~ ✅ ~1-5ms per MCP tool call overhead acceptable; Codex CLI spawn is one-time per query
- ~~How to handle provider-specific system prompts (Claude has its own conventions, Codex has its own)?~~ ✅ Claude: systemPrompt option. Codex: write CODEX.md file in workspace (fase_2/05)

## New Open Questions (from 2026-02-17 08:00 research)
- Should we eventually support Codex MCP server mode (`codex mcp-server`) for interactive approvals, or is SDK-only sufficient?
- How does Codex's Rust-level sandboxing interact with Alive's UID/GID privilege drop? Could they conflict?
- Can we pass custom instructions to Codex via `--config system_message="..."` or is CODEX.md the only option?
- ~~What happens when Codex CLI isn't installed or the binary path is wrong? Need graceful error handling in CodexProvider.~~ ✅ Documented in fase_1/08

## New Open Questions (from 2026-02-17 12:00 research)
- Should MCP servers be spawned per-query or per-worker? (Analysis in fase_2/08 recommends per-query for v1, let SDKs manage)
- Do both Claude SDK and Codex SDK handle MCP server stdio lifecycle themselves, or must we pre-spawn? (Need to verify Claude SDK behavior)
- How to handle `restart_dev_server` tool's need for `systemctl` privileges in standalone MCP server? (sudoers approach proposed in fase_2/11)
- Should tool functions be refactored to accept context as parameter BEFORE the MCP migration, or during?

## New Open Questions (from 2026-02-17 16:00 research)
- Does Codex re-read CODEX.md on thread resume? If not, system prompt injection only works for new threads (fase_2/12)
- ~~Does `--config system_message="..."` work via SDK? Would be cleaner than CODEX.md file manipulation~~ ✅ LIKELY NOT — `system_message` not in Rust config schema. Use CODEX.md approach (fase_2/16)
- ~~MCP server `env` in Codex config — is it additive (merge) or replacing?~~ ✅ Likely additive (child process inherits env + additions). Use project-level config.toml for MCP servers instead of SDK config option (fase_2/17)

## New Open Questions (from 2026-02-17 20:00 research)
- Does Codex's `skipGitRepoCheck` fully bypass git requirement, or just suppress warning? (Alive workspaces may not be git repos)
- Can `additionalDirectories` include Alive's shared packages dir for cross-workspace imports?
- How does Codex handle `outputSchema` failures (model doesn't produce valid JSON)? Need error handling strategy.
- ~~Thread session directory (~/.codex/sessions/) — how to isolate per-workspace to prevent cross-contamination?~~ ✅ Override HOME env var per workspace (fase_2/20)

## New Open Questions (from 2026-02-18 04:00 research)
- ~~Does `config.system_message` actually work as a Codex config key?~~ ✅ NO — `system_message` doesn't exist. Use `developer_instructions` instead (fase_1/13)
- How does Codex handle abort mid-MCP-call? Does the MCP server subprocess get cleaned up? (fase_2/18)
- Is `maxTurns` really needed, or can Alive rely on timeout + token budget instead? (fase_2/21)
- Should Codex's `sandboxMode` and `modelReasoningEffort` be exposed in Alive workspace settings? (fase_2/21)

## New Open Questions (from 2026-02-19 00:00 research)
- None new — focused on resolving existing questions and scoping v1

## Resolved (from 2026-02-19 00:00 research)
- ~~How does `env_vars` passthrough interact with `env` replacement in MCP server config?~~ ✅ `env_vars` passes named parent vars to child; `env` adds key=value pairs. Complementary. (fase_1/15)
- ~~Can `CODEX_HOME` be set to a per-workspace path without breaking Codex binary resolution?~~ ✅ Yes — CODEX_HOME controls storage, not binary (fase_2/32)
- ~~How do OAuth MCP servers work with Codex?~~ ✅ Use `bearer_token_env_var` + env-passed tokens. No tokens on disk. (fase_1/15)

## Remaining Open Questions (Final — Feb 19)
1. **Does `developer_instructions` work via `--config` CLI flag?** — Runtime test needed (fase_3/05 test 1, fase_3/06 test 2). Fallback: config.toml.
2. **Does Codex's seccomp sandbox conflict with Node.js MCP servers?** — Use `danger-full-access` for v1 (fase_2/26).
3. **Does `skipGitRepoCheck` fully bypass git requirement?** — Likely yes, verify at pre-flight.
4. **How does Codex handle abort mid-MCP-call?** — AbortSignal → SIGTERM to CLI → cascade to MCP children. Verify at pre-flight.

All 4 are **runtime verification only** — not planning blockers. See fase_3/06 for test procedures.

## Resolved Open Questions (Feb 19)
- **Input delivery mechanism**: User prompts are sent via stdin to `codex exec`, NOT as CLI args. Safe for large/special-character prompts. (fase_2/32)
- **Config flattening confirmed**: `CodexOptions.config` objects are serialized to `--config key=value` TOML args via `serializeConfigOverrides()`. Nested objects use dotted paths. (fase_1/15)
- **`developer_instructions` delivery**: Passed as `--config developer_instructions="..."` CLI arg. Still needs runtime verification (fase_3/05 Test 1).

## Log
- **2026-02-19 23:58** — Ninth (final) research iteration:
  - Re-verified all SDK source files against latest main (fase_1/15). No API changes since Feb 18.
  - **Confirmed config flattening mechanism** in exec.ts — `CodexOptions.config` is serialized to `--config key=value` TOML format. `developer_instructions` can be passed this way.
  - **Confirmed stdin input delivery** — user prompts written to child process stdin, not CLI args. No escaping issues. (fase_2/32)
  - Graceful degradation strategy (fase_2/29) — binary not found, auth failure, rate limits, CLI crashes, MCP server failures. Provider fallback is v2.
  - Concurrency & worker pool analysis (fase_2/30) — 3-level process tree (manager→worker→CLI), resource implications, MCP server scaling, rate limit sharing, cleanup strategy.
  - Logging & debugging (fase_2/31) — stderr capture limitations, JSONL event logging, Sentry integration, debug mode toggle.
  - Updated implementation checklist (fase_2/23) — corrected `system_message` → `developer_instructions` reference.
  - **PLAN STATUS**: Comprehensive and ready for implementation. All SDK APIs verified. All architectural decisions documented. 46h estimated work across 6 phases. Phase 1 (MCP refactoring) remains the single blocker. Two runtime verification tests (fase_3/05 Tests 1-2) must pass before committing to implementation.
- **2026-02-17 00:00** — Initial research: current Alive architecture (fase_1/01), Codex SDK analysis (fase_1/02), Emdash reference analysis (fase_1/03)
- Emdash (YC W26) supports 21 agents via CLI spawning. Simple but no tool control. Their provider registry is clean reference material.
- Codex has a TypeScript SDK (`@openai/codex-sdk`) — structured events, thread-based sessions. Viable for SDK integration.
- **DECISION: Path B only.** SDK integration for Claude + Codex. No CLI fallback. Tool control and MCP are essential to the product — not negotiable. Every provider must support structured events, tool permissions, and MCP servers.
- **2026-02-17 04:00** — Deep research iteration:
  - Codex MCP support fully documented (fase_1/05) — Codex has complete MCP support via `config.toml` `[mcp_servers]`, stdio + HTTP transports, OAuth, tool call events in SDK
  - Event type mapping (fase_1/06) — full Claude ↔ Codex ↔ Alive unified event mapping with `AgentEvent` interface
  - AgentProvider abstraction layer designed (fase_2/01) — interface, registry, provider implementations, migration path (5 phases)
  - Database & frontend changes spec'd (fase_2/02) — workspace-level provider column, API key storage, UI components for provider selector + Codex item types
  - Auth & credential management (fase_2/03) — per-workspace API key in lockbox, env isolation, Codex CLI installation
  - Testing & rollout strategy (fase_3/01) — unit/integration/e2e tests, 3-phase rollout, feature flags, monitoring, rollback plan
  - **KEY FINDING**: Alive's internal MCP servers must be refactored from in-process `createSdkMcpServer()` to standalone stdio processes. This is the single biggest prerequisite.
  - All original open questions resolved ✅. Four new questions identified.
- **2026-02-17 08:00** — Third research iteration (source-verified):
  - Verified Codex SDK API against actual source code (fase_1/07) — confirmed all types, found critical details:
    - SDK `env` option REPLACES process.env entirely (not merge!) — must pass all env vars
    - `approvalPolicy` set at launch, NOT interactive via SDK — only `"never"` (auto-approve) viable for v1
    - No system prompt option — must use CODEX.md file workaround
    - No tool allowlist/denylist, no maxTurns, no canUseTool callback
  - Created detailed MCP refactoring plan (fase_2/04) — the critical path blocker:
    - Must migrate from `createSdkMcpServer()` (in-process) to `@modelcontextprotocol/sdk` (stdio)
    - 3 MCP servers to migrate: alive-tools (10 tools), alive-workspace (6 tools), alive-email (2 tools)
    - Estimated ~16h of work
    - Context passing via env vars (workspace ID, user ID, paths)
  - Documented system prompts, feature parity matrix, and provider limitations (fase_2/05)
  - Created implementation dependency graph and phase ordering (fase_2/06):
    - 6 phases, ~2-3 weeks total
    - Phase 1 (MCP refactoring) is the single blocker — everything depends on it
    - Phase 0 (prep) can start immediately
  - Resolved all 4 remaining open questions, identified 4 new ones
  - **KEY INSIGHT**: The Codex SDK is fundamentally fire-and-forget — no runtime tool control. This is acceptable for v1 (matches Alive's `bypassPermissions` mode) but limits Codex workspaces to full-auto operation.
- **2026-02-17 12:00** — Fourth research iteration (depth + breadth):
  - Codex CLI binary management documented (fase_1/08) — installation, privilege drop access, version compatibility, session directory, disk cleanup
  - Error handling & recovery patterns (fase_2/07) — 6 error categories (auth, rate limit, CLI spawn, MCP crash, network, timeout), unified error format, retry strategies, graceful degradation
  - MCP server process lifecycle (fase_2/08) — per-query vs per-worker analysis. **KEY REVISION**: Both Claude and Codex SDKs spawn MCP servers themselves from command specs. Don't build a custom process manager — just pass specs. Simpler than originally planned.
  - Frontend component architecture (fase_2/09) — universal message shape, 3 new renderers (PlanMessage, SearchMessage, FileChangeMessage), ProviderBadge, ProviderSettings, model catalog per provider. ~8.5h estimated frontend work.
  - Migration path for existing workspaces (fase_2/10) — 6-stage rollout from DB migration through GA, zero-downtime MCP migration via feature flags, session continuity handling when switching providers
  - MCP tool migration concrete examples (fase_2/11) — examined actual tool code, identified context-passing changes needed, shared code strategy (tools stay in packages/tools, MCP servers import them), migration order by risk level
  - Monitoring & observability (fase_3/02) — per-provider metrics, structured logging, PostHog events, alerting thresholds
  - **KEY REVISION on MCP lifecycle**: Don't pre-spawn MCP servers. Pass command+env specs to provider SDKs, let them manage subprocess lifecycle. This eliminates the `McpServerManager` class from the plan and simplifies Phase 1 significantly.
  - **VERIFIED**: Claude SDK DOES support `McpStdioServerConfig` (`{ type: "stdio", command: string, args?: string[], env?: Record<string, string> }`). This means both Claude and Codex can use the same stdio MCP server specs. The `createSdkMcpServer` in-process approach was a convenience, not a requirement. MCP refactoring plan is fully viable.
  - All major technical unknowns are now resolved. Remaining questions are implementation details (auth model alignment with server-only keys, referenced fase_* docs need stakeholder review).
- **2026-02-17 16:00** — Fifth research iteration (source verification + new docs):
  - **SDK path correction**: SDK moved from `codex-js/codex-sdk/` to `sdk/typescript/` (fase_1/09). All source types re-verified against latest main.
  - New finding: `CODEX_API_KEY` env var (not `OPENAI_API_KEY`) used by SDK internally
  - New finding: `baseUrl` option enables OpenAI-compatible endpoints
  - System prompt injection strategy documented (fase_2/12) — CODEX.md file + prompt prepend for v1, config system_message investigation for v2
  - Cost & billing comparison (fase_2/13) — token pricing, usage tracking mapping, provider-aware cost display
  - Environment isolation deep-dive (fase_2/14) — env replacement semantics, API key isolation, session directory layout
  - Test fixtures and mocks (fase_3/03) — JSONL fixture format, mock provider, CodexExec spy pattern, event mapping test structure
  - 3 new open questions identified (CODEX.md resume behavior, system_message config, MCP env merging)
- **2026-02-17 20:00** — Sixth research iteration (SDK refresh + implementation depth):
  - Re-verified all SDK source files against latest main (fase_1/10):
    - `approvalPolicy` is now a first-class ThreadOption (not just config)
    - `webSearchMode`, `networkAccessEnabled`, `additionalDirectories` are new SDK options
    - Image input support via `UserInput` type
    - `outputSchema` for structured output
    - `ModelReasoningEffort` enum (minimal → xhigh)
    - Binary vendored in platform-specific npm packages
  - Worker entry refactoring walkthrough (fase_2/15) — step-by-step transformation from Claude-specific to provider-agnostic, with code examples for ClaudeProvider, CodexProvider, registry, and worker changes. ~14h estimated.
  - System message strategy resolved (fase_2/16) — `system_message` NOT a valid Codex config key. Use CODEX.md file injection with HTML comment markers. Encapsulated in provider impl.
  - MCP server config passing strategy (fase_2/17) — SDK config option unreliable for complex nested TOML. **Use project-level `.codex/config.toml`** written to workspace before session start. More reliable, full MCP spec support (command, args, env).
  - E2E test scenarios (fase_3/04) — 24 concrete test cases across 6 categories (provider selection, lifecycle, MCP, normalization, billing, security). Fixture-based mock approach.
  - Resolved 2 open questions, identified 4 new ones
  - **KEY INSIGHT**: Project-level config.toml is the cleanest way to configure Codex for Alive. Write it per-workspace before session, let Codex read it naturally. No complex CLI flag serialization needed.
- **2026-02-18 04:00** — Seventh research iteration (gap analysis + consolidation):
  - Re-verified SDK source against latest main. Found `CodexOptions.config` field that flattens to `--config key=value` CLI args (fase_1/11). **This potentially enables system_message via SDK** — contradicts fase_2/16 conclusion. Needs runtime testing to confirm.
  - Cancellation & abort flow documented (fase_2/18) — Claude uses `abort()`, Codex uses `AbortSignal`. Unified `AgentSession.abort()` interface designed.
  - Image input support documented (fase_2/19) — Codex uses local file paths, Claude uses base64. Marked as v2 feature, but types designed to accommodate from v1.
  - Session resume architecture (fase_2/20) — Claude uses session directories, Codex uses thread IDs. Unified resume model with per-workspace isolation strategy (env-based HOME override for Codex).
  - Concrete API mapping (fase_2/21) — side-by-side comparison of actual `query()` call in worker-entry.mjs vs equivalent Codex `Thread.runStreamed()`. Full parameter mapping table. Identified 3 Claude features missing in Codex (maxTurns, canUseTool, allowedTools) and 6 Codex features missing in Claude (sandboxMode, reasoningEffort, webSearch, outputSchema, additionalDirectories, networkAccess).
  - New Codex item types for frontend (fase_2/22) — TodoListItem, ReasoningItem, ErrorItem renderers needed. Full item type mapping table for frontend.
  - **Consolidated implementation checklist** (fase_2/23) — 6 phases, ~46h total. Phase 1 (MCP refactoring) remains the single blocker. All other phases can partially overlap.
  - Remaining open questions from 20:00 session still stand (skipGitRepoCheck behavior, additionalDirectories, outputSchema error handling, session directory isolation). All addressed in new docs.
  - **Plan is now comprehensive enough to begin implementation.** All technical unknowns are documented with proposed solutions. Next iteration should focus on any remaining Codex Rust config schema verification.
- **2026-02-18 16:00** — Eighth research iteration (Rust config source audit + critical corrections):
  - **CRITICAL CORRECTION**: `system_message` is NOT a valid Codex config key. The Rust `Config` struct uses `developer_instructions`, `base_instructions`, and `user_instructions` (fase_1/13). Previous docs (fase_2/16, fase_2/24) were wrong.
  - Full Codex Rust config struct audited — discovered `ephemeral`, `model_context_window`, `agent_max_threads`, `memories`, `model_providers` fields.
  - Complete `McpServerConfig` schema documented — supports `command`, `args`, `env`, `env_vars`, `cwd`, `enabled_tools`, `disabled_tools`, `required`, timeouts, OAuth scopes. Much richer than previously assumed.
  - `McpServerTransportConfig` has two variants: Stdio (command-based) and StreamableHttp (URL-based with auth headers).
  - `ApprovalMode` expanded: `"never"` | `"on-request"` | `"on-failure"` | `"untrusted"` — `"on-failure"` is interesting for future semi-auto mode.
  - Network proxy system documented (fase_2/26) — Codex has domain allowlists, SOCKS proxy, etc. Potential conflicts with Alive's container networking. Recommendation: use `danger-full-access` for v1.
  - Revised CodexProvider implementation (fase_2/27) — incorporates all corrections, complete event normalization code.
  - MCP config definitive approach (fase_2/25) — project-level `.codex/config.toml` with `CODEX_HOME` isolation.
  - Runtime verification test suite (fase_3/05) — 7 specific tests that must pass before implementation. Tests 1-2 are BLOCKERS.
  - **New docs**: fase_1/13, fase_2/25, fase_2/26, fase_2/27, fase_3/05
  - **KEY INSIGHT**: The `developer_instructions` config key is the cleanest system prompt mechanism — injected as a separate developer message, coexists with user's own CODEX.md (`user_instructions`). This is actually BETTER than the file-based approach.
- **2026-02-19 00:00** — Ninth research iteration (v1 scoping + gap closure):
  - Verified Codex `StreamableHttp` auth mechanisms from Rust source (fase_1/15) — supports `bearer_token_env_var`, `http_headers`, and `env_http_headers`. **OAuth MCP servers solved**: use env var indirection, tokens never touch disk.
  - Created concrete ClaudeProvider extraction guide (fase_2/29) — identifies exactly what moves out of worker-entry.mjs. **KEY STRATEGY CHANGE**: v1 CodexProvider emits Claude-compatible message format → zero frontend changes needed. Saves ~12h.
  - Documented OAuth MCP + search tools multi-provider considerations (fase_2/30) — `withSearchToolsConnectedProviders` needs env-var replacement for standalone MCP servers.
  - Defined v1 minimal scope (fase_2/31) — 3-week plan, ~30h (down from 46h). Defers unified event format, Codex-specific UI, OAuth MCP for Codex, session resume.
  - Resolved 3 open questions (fase_2/32): env_vars passthrough, CODEX_HOME isolation, OAuth MCP auth.
  - **New docs**: fase_1/15, fase_2/29, fase_2/30, fase_2/31, fase_2/32
  - **PLAN STATUS**: Comprehensive and implementation-ready. All blockers identified. Remaining unknowns are runtime verification only (fase_3/05). Next steps: run verification tests, then begin Phase 1 (MCP stdio refactoring).
- **2026-02-19 04:00** — Tenth and final research iteration (consolidation + implementation readiness):
  - Verified Codex SDK exports against latest main — stable, no API changes since last check
  - Created risk register (fase_2/33) — 10 risks ranked by impact/likelihood, top 3: env replacement bugs, MCP context loss, system prompt injection uncertainty
  - Created Architecture Decision Record (fase_2/34) — 6 key decisions documented with rationale and rejected alternatives
  - Created pre-flight verification guide (fase_3/06) — 6 concrete tests to run before writing production code, with pass/fail criteria and results template. Tests 1-3 and 5 are BLOCKERS.
  - Created implementation kickoff summary (fase_2/35) — TL;DR for the developer starting implementation, with reference table to all relevant docs
  - Consolidated remaining open questions in README — only 4 remain, all runtime verification (not planning blockers)
  - **New docs**: fase_2/33, fase_2/34, fase_2/35, fase_3/06
  - **PLANNING COMPLETE.** 15 fase_1 docs, 35 fase_2 docs, 6 fase_3 docs. All technical questions answered or reduced to runtime verification. Ready for implementation.
- **2026-02-19 16:00** — Final verification check:
  - Re-checked Codex SDK exports (`index.ts`, `threadOptions.ts`) against latest main — **no changes** since last audit. API stable.
  - `ThreadOptions` confirmed: `model`, `sandboxMode`, `workingDirectory`, `skipGitRepoCheck`, `modelReasoningEffort`, `networkAccessEnabled`, `webSearchMode`, `webSearchEnabled`, `approvalPolicy`, `additionalDirectories`.
  - `ApprovalMode`, `SandboxMode`, `ModelReasoningEffort`, `WebSearchMode` types unchanged.
  - No new exports or breaking changes detected.
  - **PLANNING REMAINS COMPLETE.** No further iterations needed before Feb 20 deadline. Next step: run pre-flight tests (fase_3/06), then begin Phase 1 implementation.
- **2026-02-19 20:00** — Final pre-deadline check:
  - Re-fetched `sdk/typescript/src/index.ts` from GitHub main — **zero changes** since last audit. Exports identical.
  - All 56 planning documents remain current. No new SDK features, no API breaks.
  - **PLANNING PHASE CLOSED.** Feb 20 deadline reached. Ready for implementation.
