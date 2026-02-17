# Fase 1.6 — Event Type Mapping: Claude ↔ Codex ↔ Alive Unified

## Current Alive Stream Types

Alive's IPC protocol uses these types (from worker → parent):

| IPC Type | Purpose |
|----------|---------|
| `session` | New session started (contains sessionId) |
| `message` | Stream content (assistant text, tool use, tool result) |
| `complete` | Query finished (contains result) |
| `error` | Query failed (contains error + diagnostics) |

These are generic enough to work with any provider.

## Claude SDK Events → Alive IPC

```
Claude SDK Message          → Alive IPC Type
─────────────────────────────────────────────
{ type: "system",           → message (+ extract session from init)
  subtype: "init" }           + session (emit sessionId)
{ type: "assistant" }       → message (text content)
{ type: "tool_use" }        → message (tool invocation)
{ type: "tool_result" }     → message (tool output)
{ type: "result",           → complete (success)
  subtype: "success" }
{ type: "result",           → complete (with errors)
  subtype: "error_during_execution" }
```

## Codex SDK Events → Alive IPC

```
Codex ThreadEvent           → Alive IPC Type
─────────────────────────────────────────────
{ type: "thread.started" }  → session (thread_id = sessionId)
{ type: "turn.started" }    → (internal, no IPC needed)
{ type: "item.started",     → message (agent text, streaming)
  item.type: "agent_message" }
{ type: "item.started",     → message (tool invocation)
  item.type: "command_execution" }
{ type: "item.started",     → message (file change)
  item.type: "file_change" }
{ type: "item.started",     → message (MCP tool call)
  item.type: "mcp_tool_call" }
{ type: "item.updated" }    → message (progress update)
{ type: "item.completed" }  → message (final state of item)
{ type: "turn.completed" }  → complete (with usage stats)
{ type: "turn.failed" }     → error
{ type: "error" }           → error (fatal)
```

### Codex Item Types → Alive Message Content

| Codex Item Type | Alive Display | Maps To |
|----------------|--------------|---------|
| `agent_message` | Assistant text response | Claude's `assistant` message |
| `reasoning` | Thinking/reasoning (if shown) | Claude's extended thinking |
| `command_execution` | Bash/shell command + output | Claude's `tool_use` (Bash) + `tool_result` |
| `file_change` | File edits (add/delete/update) | Claude's `tool_use` (Edit/Write) + `tool_result` |
| `mcp_tool_call` | MCP tool invocation | Claude's `tool_use` (MCP tool) + `tool_result` |
| `web_search` | Web search query | No Claude equivalent (new) |
| `todo_list` | Agent's plan/checklist | No Claude equivalent (new) |
| `error` | Non-fatal error | Error in message stream |

## Unified AgentEvent Interface

```typescript
interface AgentEvent {
  type: "session" | "message" | "complete" | "error"
  
  // session
  sessionId?: string        // Claude session ID or Codex thread_id
  
  // message — normalized content
  content?: {
    role: "assistant" | "tool"
    type: "text" | "tool_use" | "tool_result" | "thinking" | "plan" | "search"
    
    // For text
    text?: string
    
    // For tool_use
    toolName?: string
    toolInput?: unknown
    toolId?: string
    
    // For tool_result
    output?: string
    isError?: boolean
    
    // For plan (Codex todo_list)
    items?: Array<{ text: string; completed: boolean }>
    
    // Original provider-specific payload (escape hatch)
    raw?: unknown
  }
  
  // complete
  result?: {
    success: boolean
    usage?: { inputTokens: number; outputTokens: number; cachedTokens?: number }
    errors?: string[]
  }
  
  // error
  error?: string
  diagnostics?: unknown
}
```

## Key Mapping Challenges

### 1. Streaming Granularity
- **Claude**: Emits individual messages as they arrive. Text streams token-by-token.
- **Codex**: Emits `item.started` → `item.updated` → `item.completed`. Items are higher-level (a full command execution, a full file change).

**Solution**: For Codex, map `item.started` as the initial message, `item.updated` for progress, `item.completed` as the final state. The frontend already handles incremental updates.

### 2. Tool Names
- **Claude**: Uses specific tool names like `Bash`, `Edit`, `Write`, `Read`, `mcp__server__tool`
- **Codex**: Uses item types like `command_execution`, `file_change`, `mcp_tool_call`

**Solution**: Normalize in the provider adapter. `command_execution` → virtual tool name `Bash`. `file_change` → virtual tool name `Edit`. `mcp_tool_call` → `mcp__${server}__${tool}`.

### 3. Session Init
- **Claude**: Emits `system/init` with tool list and MCP status
- **Codex**: Emits `thread.started` with thread_id only

**Solution**: For Codex, the init event is simpler. MCP status can be gathered from the `config` if needed, but may not be available in the event stream.

### 4. Approval Flow
- **Claude**: `canUseTool` callback in-process → approve/deny synchronously
- **Codex**: `applyPatchApproval` / `execCommandApproval` JSON-RPC requests → async approve/deny

**Solution**: Both need to map to Alive's permission system. For Codex, the worker needs to respond to approval requests from the CLI subprocess. This requires bidirectional communication with the Codex SDK.

## Frontend Impact

The frontend currently renders Claude-specific message types. Changes needed:

1. **New item types**: `web_search`, `todo_list` need UI components
2. **File changes**: Codex `file_change` has a different shape than Claude's Edit tool output — need normalized rendering
3. **Command execution**: Codex provides `aggregated_output` + `exit_code` — similar to Claude's Bash but structured differently
4. **Provider indicator**: Show which provider generated each message (useful when workspace supports both)
