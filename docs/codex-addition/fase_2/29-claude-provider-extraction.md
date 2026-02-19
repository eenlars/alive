# Claude Provider Extraction — Concrete Refactoring Guide

## Problem

`worker-entry.mjs` is a 1000+ line monolith that mixes:
1. IPC/socket communication with parent process
2. Privilege dropping and env isolation
3. Claude SDK import and query execution
4. MCP server assembly (internal + global + OAuth)
5. Tool permission logic (`canUseTool`, `allowedTools`)
6. Message streaming and result handling
7. Error recovery and diagnostics

For multi-provider support, items 3-6 must be extracted into a `ClaudeProvider` class while 1-2 and 7 remain in the worker shell.

## What Stays in worker-entry.mjs

```
worker-entry.mjs (the "shell")
├── Socket IPC setup (lines 101-160)
├── Privilege drop (lines 280-380)
├── Message parsing & validation (lines 460-570)
├── Provider instantiation (NEW — based on payload.provider)
├── Streaming loop: for await (message of provider.query())
├── IPC send: session, message, complete, error
├── Abort/cancel handling
└── Error recovery & diagnostics
```

## What Moves to ClaudeProvider

### Imports to move
```javascript
// These become ClaudeProvider's responsibility:
import { query } from "@anthropic-ai/claude-agent-sdk"
import { toolsInternalMcp, workspaceInternalMcp, emailInternalMcp, withSearchToolsConnectedProviders } from "@webalive/tools"
import { GLOBAL_MCP_PROVIDERS, isOAuthMcpTool } from "@webalive/shared"
```

### MCP Server Assembly (lines 647-685)
Currently builds `mcpServers` object inline. Move to:
```typescript
class ClaudeProvider {
  private buildMcpServers(options: SessionOptions): Record<string, McpServer> {
    return {
      "alive-workspace": workspaceInternalMcp,
      "alive-tools": toolsInternalMcp,
      ...this.buildOptionalMcpServers(options.extraTools),
      ...this.buildGlobalMcpServers(),
      ...(options.oauthMcpServers || {}),
    }
  }
}
```

### Tool Permission Logic (lines 580-640)
`canUseTool` callback, `allowedTools` filtering, heavy bash detection — all Claude-specific (Codex doesn't have `canUseTool`).

### Query Execution (lines 710-810)
The `query()` call and message iteration. Becomes `ClaudeProvider.query()`.

### withSearchToolsConnectedProviders wrapper
This is Claude-specific context setup. Move inside ClaudeProvider.

## ClaudeProvider Interface

```typescript
class ClaudeProvider implements AgentProvider {
  async *query(options: QueryOptions): AsyncGenerator<AgentEvent> {
    const mcpServers = this.buildMcpServers(options);
    const canUseTool = this.buildCanUseTool(options);
    
    await withSearchToolsConnectedProviders(options.connectedProviders, async () => {
      const agentQuery = query({
        prompt: options.message,
        options: {
          cwd: options.workingDirectory,
          model: options.model,
          maxTurns: options.maxTurns,
          permissionMode: options.permissionMode,
          allowedTools: options.allowedTools,
          canUseTool,
          mcpServers,
          systemPrompt: options.systemPrompt,
          resume: options.resume,
          resumeSessionAt: options.resumeSessionAt,
          abortSignal: options.signal,
          // ... other options
        },
      });

      for await (const message of agentQuery) {
        // Pass through raw Claude messages for now
        // Normalization can happen later (or in the worker shell)
        yield { type: "raw", provider: "claude", data: message };
      }
    });
  }
}
```

## Migration Strategy: Raw Passthrough First

**Critical insight**: The frontend currently renders Claude SDK messages directly. A full event normalization layer is a big change.

**Recommended approach for v1:**
1. Extract ClaudeProvider that yields RAW Claude messages (no normalization)
2. CodexProvider normalizes Codex events INTO Claude message format
3. Frontend stays unchanged
4. Later (v2): introduce unified `AgentEvent` and update frontend

This means `CodexProvider` does the heavy lifting of mapping Codex → Claude message format, which is easier than changing the entire frontend.

## Codex → Claude Message Format Mapping

| Codex Event | Claude Message Equivalent |
|---|---|
| `thread.started` | `{ type: "system", subtype: "init", session_id }` |
| `item.completed` (agent_message) | `{ type: "assistant", message: { content: [...] } }` |
| `item.*` (command_execution) | `{ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command } }] } }` + `{ type: "tool", content: [{ type: "tool_result", output }] }` |
| `item.*` (file_change) | `{ type: "assistant", message: { content: [{ type: "tool_use", name: "Write" }] } }` |
| `item.*` (mcp_tool_call) | `{ type: "assistant", message: { content: [{ type: "tool_use", name: "mcp__server__tool" }] } }` |
| `turn.completed` | `{ type: "result", subtype: "success", usage }` |
| `turn.failed` | `{ type: "result", subtype: "error_max_turns" }` |

This approach means:
- Zero frontend changes for v1
- Codex messages "look like" Claude messages to the frontend
- Provider badge can be added separately (cosmetic)
- Later normalization is a clean refactor, not a big-bang change

## File Changes Summary

| Action | File | Effort |
|---|---|---|
| Create | `packages/worker-pool/src/providers/claude.ts` | 4h |
| Create | `packages/worker-pool/src/providers/codex.ts` | 6h |
| Create | `packages/worker-pool/src/providers/types.ts` | 1h |
| Create | `packages/worker-pool/src/providers/registry.ts` | 0.5h |
| Modify | `packages/worker-pool/src/worker-entry.mjs` | 3h |
| No change | Frontend (v1) | 0h |

**Total: ~14.5h** (vs 22h if normalizing + updating frontend)
