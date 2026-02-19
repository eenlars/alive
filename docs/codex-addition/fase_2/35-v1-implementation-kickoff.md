# V1 Implementation Kickoff — TL;DR for the Developer

## What We're Building

Add Codex (OpenAI) as a second coding agent in Alive. Users pick Claude or Codex per workspace.

## Architecture in One Paragraph

Extract Claude-specific code from `worker-entry.mjs` into a `ClaudeProvider` class. Build a parallel `CodexProvider` that wraps `@openai/codex-sdk`. Both implement the same `AgentProvider` interface (AsyncGenerator-based). CodexProvider translates Codex events into Claude message shapes so the frontend needs zero changes. MCP servers (alive-tools, alive-workspace, alive-email) get refactored from in-process to standalone stdio — required because Codex can only use stdio MCP.

## Key Files

| Current | After |
|---|---|
| `worker-entry.mjs` (monolith) | `worker-entry.mjs` (shell) + `providers/claude.ts` + `providers/codex.ts` |
| `createSdkMcpServer()` (in-process) | `alive-tools-server.ts` etc. (stdio processes) |
| No provider column in DB | `workspaces.provider` column (`'claude'` \| `'codex'`) |

## Order of Operations

1. **Run pre-flight tests** (fase_3/06) — validate assumptions before coding
2. **Phase 1**: Refactor MCP servers to stdio (biggest risk, most work)
3. **Phase 2**: Extract providers, build CodexProvider
4. **Phase 3**: DB migration + workspace settings UI
5. **Phase 4**: Polish, error handling, feature flag, ship

## Key Decisions Already Made

- **No unified event format for v1** — Codex emits Claude-shaped messages (ADR: fase_2/34)
- **No user-supplied API keys** — server-side only
- **`danger-full-access` sandbox** — Alive has its own isolation
- **Project-level config.toml** — for MCP servers and developer_instructions
- **`CODEX_HOME` per workspace** — session isolation

## What NOT to Do

- Don't change the frontend message rendering (v1)
- Don't build provider switching mid-conversation (v2)
- Don't build session resume for Codex (v2)
- Don't build custom MCP process manager — let SDKs manage stdio lifecycle

## Reference Docs

| Topic | Doc |
|---|---|
| Codex SDK API | fase_1/07, fase_1/12, fase_1/13 |
| Event mapping | fase_1/06 |
| Provider interface | fase_2/01 |
| Claude extraction | fase_2/29 |
| Codex provider impl | fase_2/27 |
| MCP refactoring | fase_2/04, fase_2/11 |
| Config approach | fase_2/25 |
| Env isolation | fase_2/14, fase_2/28 |
| Error handling | fase_2/07 |
| Risk register | fase_2/33 |
| Pre-flight tests | fase_3/06 |
| V1 scope | fase_2/31 |
| Full checklist | fase_2/23 |
