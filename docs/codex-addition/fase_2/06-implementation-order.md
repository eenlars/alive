# Fase 2.6 — Implementation Order & Dependency Graph

## Critical Path

```
MCP Refactoring (2.4)  ──────────────────────────────┐
                                                      ▼
Provider Interface (2.1) ──► ClaudeProvider ──► CodexProvider ──► Frontend (2.2)
                                                      ▲
DB Schema (2.2) ──────────────────────────────────────┘
Auth/Credentials (2.3) ───────────────────────────────┘
```

## Phases (in order)

### Phase 0: Prep (can start now, no dependencies)
- [ ] Install `@openai/codex` CLI on claude-server globally
- [ ] Install `@openai/codex-sdk` in worker-pool package
- [ ] Verify Codex CLI works: `codex exec "echo hello"` with an OpenAI API key
- [ ] Add `@modelcontextprotocol/sdk` dependency to a new `packages/mcp-servers` workspace

### Phase 1: MCP Refactoring (BLOCKER — everything else waits)
- [ ] Create `packages/mcp-servers/alive-tools/` with stdio MCP server
- [ ] Migrate all 10 tools from `createSdkMcpServer` to `@modelcontextprotocol/sdk`
- [ ] Create `packages/mcp-servers/alive-workspace/` (6 tools)
- [ ] Create `packages/mcp-servers/alive-email/` (2 tools)
- [ ] Update `worker-entry.mjs` to spawn MCP servers as child processes
- [ ] Test Claude still works with standalone MCP servers
- [ ] Feature flag: `USE_STANDALONE_MCP` (default false initially)

### Phase 2: Provider Abstraction (after Phase 1)
- [ ] Create `packages/worker-pool/src/providers/types.ts`
- [ ] Create `packages/worker-pool/src/providers/registry.ts`
- [ ] Extract current Claude logic into `ClaudeProvider` (pure refactor, zero behavior change)
- [ ] Add `provider` field to IPC query payload
- [ ] Update `handleQuery()` to use provider registry
- [ ] Test: Claude provider works identically through abstraction layer

### Phase 3: Codex Provider (after Phase 2)
- [ ] Implement `CodexProvider` using `@openai/codex-sdk`
- [ ] Event mapping: `ThreadEvent` → `AgentEvent`
- [ ] MCP server config passthrough via `CodexOptions.config`
- [ ] CODEX.md system prompt workaround
- [ ] Session resume via `resumeThread()`
- [ ] Abort via `AbortSignal`
- [ ] Test with simple prompts, tool use, MCP tools

### Phase 4: Database & Auth (can partially parallel with Phase 3)
- [ ] Add `agent_provider` column to workspaces table
- [ ] Add encrypted API key storage for OpenAI keys
- [ ] API endpoint: update workspace provider + API key
- [ ] Pass provider + API key through stream creation → worker payload

### Phase 5: Frontend (after Phase 3 + 4)
- [ ] Provider selector in workspace settings
- [ ] API key input for OpenAI
- [ ] Model dropdown filtered by provider
- [ ] Provider badge on messages
- [ ] New item renderers: `todo_list`, `web_search`, `file_change`
- [ ] Provider indicator in chat input

### Phase 6: Testing & Rollout (after Phase 5)
- [ ] Unit tests for event mapping
- [ ] Integration test: Codex end-to-end
- [ ] Feature flag: `ENABLE_CODEX_PROVIDER`
- [ ] Internal testing
- [ ] Beta rollout
- [ ] GA

## Estimated Timeline

| Phase | Duration | Can Parallel? |
|-------|----------|---------------|
| Phase 0: Prep | 1 day | Yes (now) |
| Phase 1: MCP Refactoring | 3-4 days | No (blocker) |
| Phase 2: Provider Abstraction | 2 days | No (needs Phase 1) |
| Phase 3: Codex Provider | 2-3 days | No (needs Phase 2) |
| Phase 4: DB & Auth | 1-2 days | Partial (schema early, wiring after Phase 3) |
| Phase 5: Frontend | 2-3 days | No (needs Phase 3+4) |
| Phase 6: Testing | 2-3 days | No (needs Phase 5) |
| **Total** | **~2-3 weeks** | |

## What Can Be Done via Alive Agents

Per the rule: every HM/RW task goes through Alive. This Codex addition IS an Alive task, so:
- MCP server scaffolding → Alive agent
- Provider interface boilerplate → Alive agent
- DB migration SQL → Alive agent
- Frontend components → Alive agent
- Test scaffolding → Alive agent

Lars builds, Alive agents handle boilerplate.
