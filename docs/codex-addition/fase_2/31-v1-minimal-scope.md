# V1 Minimal Scope — What to Ship First

## Philosophy

Ship the smallest useful Codex integration. Expand later.

## V1 Includes

1. **Codex as alternative provider** — workspace setting, persisted in DB
2. **Internal MCP servers as stdio** — required for both providers
3. **ClaudeProvider extraction** — from worker-entry.mjs
4. **CodexProvider** — emitting Claude-compatible message format (no frontend changes)
5. **Provider selector** — simple dropdown in workspace settings
6. **Server-side API key** — single Codex API key, not per-user

## V1 Excludes (defer to v2+)

| Feature | Why Defer |
|---|---|
| Unified AgentEvent format | Frontend rewrite, big scope |
| Per-user Codex API keys | Complexity, billing unclear |
| Codex-specific UI (TodoList, FileChange renderers) | Works "good enough" as generic tool_use |
| Session resume across providers | Edge case, complex |
| Provider switching mid-conversation | UX unclear, session state issues |
| OAuth MCP servers with Codex | Security review needed for token-on-disk |
| Image input for Codex | Nice-to-have, not blocking |
| Web search mode toggle | Codex-specific feature, low priority |
| Reasoning effort control | Can use default "medium" |
| `additionalDirectories` | Workspace-scoped already sufficient |

## V1 Critical Path (Revised)

```
Week 1: MCP stdio refactoring (Phase 1)
  └── Migrate 3 internal MCP servers to standalone stdio
  └── Test with Claude SDK using McpStdioServerConfig
  └── Regression test: everything still works

Week 2: Provider abstraction + Codex (Phase 2)
  └── Extract ClaudeProvider
  └── Build CodexProvider (Claude-message-compatible output)
  └── DB migration: add provider column
  └── Provider selector in workspace settings
  └── Basic Codex e2e test

Week 3: Polish + ship (Phase 3)
  └── Error handling for Codex failures
  └── Provider badge in chat header
  └── Feature flag for gradual rollout
  └── Documentation
```

## Estimated Total: ~30h (down from 46h)

The 16h savings come from:
- No frontend event normalization layer (-8h)
- No Codex-specific UI components (-4h)  
- No OAuth MCP for Codex in v1 (-2h)
- No session resume for Codex in v1 (-2h)

## Success Criteria

1. User can select "Codex" in workspace settings
2. Codex queries execute and stream results to frontend
3. MCP tools (workspace, tools) work with Codex
4. Errors are handled gracefully (falls back to error message, not crash)
5. Claude continues to work exactly as before (zero regression)

## Risk: Claude-Compatible Message Format

The biggest risk of the "Codex emits Claude-format messages" approach is maintenance burden. Every Codex event must be translated into Claude's message shape. If Claude SDK changes its format, the translation breaks.

**Mitigation**: Keep the translation layer thin and well-tested. It's a bridge to v2's unified format, not a permanent solution.
