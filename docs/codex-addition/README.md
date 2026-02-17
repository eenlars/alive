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
- ~~How to handle auth (API keys) per provider?~~ ✅ Per-workspace API key in lockbox, passed via IPC payload
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

## Log
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
  - All major technical unknowns are now resolved. Remaining questions are implementation details.
