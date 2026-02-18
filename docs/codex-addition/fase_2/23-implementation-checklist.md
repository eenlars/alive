# Fase 2.23 — Implementation Checklist (Consolidated)

## Pre-Flight (can start now)

- [ ] Install `@openai/codex-sdk` in worker-pool package
- [ ] Verify `codex` CLI binary is available at worker runtime (fase_1/08)
- [ ] Test `config.system_message` via SDK — does it actually reach the Codex agent? (fase_1/11)
- [ ] Test MCP server config via project-level `.codex/config.toml` in a scratch workspace

## Phase 1: MCP Refactoring (~16h) — THE BLOCKER

- [ ] Create `packages/tools/src/mcp-servers/alive-tools-server.ts` — standalone stdio MCP server wrapping existing 10 tools
- [ ] Create `packages/tools/src/mcp-servers/alive-workspace-server.ts` — standalone stdio for 6 workspace tools
- [ ] Create `packages/tools/src/mcp-servers/alive-email-server.ts` — standalone stdio for 2 email tools
- [ ] Each server reads context from env vars: `ALIVE_WORKSPACE_ID`, `ALIVE_USER_ID`, `ALIVE_WORKSPACE_PATH`
- [ ] Add `bin` entries to `packages/tools/package.json` for each server
- [ ] Test each MCP server standalone with `npx @modelcontextprotocol/inspector`
- [ ] Update `worker-entry.mjs` to use stdio MCP servers instead of `createSdkMcpServer()`
- [ ] Verify Claude still works with stdio MCP servers (regression test)

## Phase 2: Provider Abstraction (~8h)

- [ ] Create `packages/worker-pool/src/providers/types.ts` — `AgentProvider`, `AgentSession`, `AgentEvent` interfaces
- [ ] Create `packages/worker-pool/src/providers/claude.ts` — extract from worker-entry.mjs
- [ ] Create `packages/worker-pool/src/providers/codex.ts` — new implementation
- [ ] Create `packages/worker-pool/src/providers/registry.ts` — provider lookup
- [ ] `AgentSession.abort()` for both providers (fase_2/18)
- [ ] Event normalizer: Claude messages → `AgentEvent` (fase_1/06)
- [ ] Event normalizer: Codex `ThreadEvent` → `AgentEvent` (fase_1/06)
- [ ] Refactor `worker-entry.mjs` to use provider registry (fase_2/15)

## Phase 3: Database & API (~4h)

- [ ] Migration: add `provider` column to workspaces table (default: `'claude'`)
- [ ] Migration: add `provider_session_id` column to sessions (fase_2/20)
- [ ] API endpoint: `PATCH /api/workspaces/:id` accepts `provider` field
- [ ] API endpoint: return `provider` in workspace GET responses
- [ ] Worker IPC: pass `provider` in query payload from manager to worker

## Phase 4: Frontend (~8h)

- [ ] `ProviderSelector` component in workspace settings (fase_2/09)
- [ ] `ProviderBadge` — small indicator showing active provider in chat header
- [ ] `FileChangeMessage` renderer (fase_2/22)
- [ ] `TodoListMessage` renderer (fase_2/22)
- [ ] Update message list to handle new normalized event types
- [ ] Model selector filtered by provider (Claude models vs OpenAI models)

## Phase 5: Auth & Config (~4h)

- [ ] Server-side Codex API key storage (env var or encrypted config)
- [ ] Per-workspace env isolation for Codex (fase_2/14)
- [ ] Codex session directory isolation per workspace (fase_2/20)
- [ ] `.codex/config.toml` generation per workspace with MCP server definitions

## Phase 6: Testing (~6h)

- [ ] Unit: event normalizer for both providers (fase_3/03)
- [ ] Unit: provider registry
- [ ] Integration: Claude provider with stdio MCP servers
- [ ] Integration: Codex provider with stdio MCP servers
- [ ] E2E: full query lifecycle for both providers (fase_3/04)
- [ ] E2E: provider switching mid-workspace
- [ ] E2E: abort/cancel for both providers

## Total Estimated: ~46h

### Critical Path
```
Phase 1 (MCP) → Phase 2 (Providers) → Phase 3 (DB) → Phase 4 (Frontend)
                                     ↘ Phase 5 (Auth)
                                                      → Phase 6 (Testing)
```

Phase 1 is the only hard blocker. Phases 3-5 can partially overlap with Phase 2.
