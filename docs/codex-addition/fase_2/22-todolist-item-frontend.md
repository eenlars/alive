# Fase 2.22 — TodoListItem & New Item Types for Frontend

## New Codex Item Types Not in Claude

Codex emits item types that Claude doesn't have. The frontend needs renderers for these.

### TodoListItem (Codex-only)

```typescript
type TodoListItem = {
  id: string;
  type: "todo_list";
  items: Array<{ text: string; completed: boolean }>;
  status: "in_progress" | "completed";
};
```

This represents the agent's internal planning/task list. It updates as the agent completes steps.

**Frontend component**: `TodoListMessage`
- Render as a checklist with checkmarks
- Update in real-time as `item.updated` events come in
- Show completed/total count

```tsx
function TodoListMessage({ item }: { item: TodoListItem }) {
  return (
    <div className="agent-todo-list">
      {item.items.map((todo, i) => (
        <div key={i} className={todo.completed ? "completed" : ""}>
          {todo.completed ? "✅" : "⬜"} {todo.text}
        </div>
      ))}
    </div>
  );
}
```

### WebSearchItem (Codex-only)

```typescript
type WebSearchItem = {
  id: string;
  type: "web_search";
  query: string;
};
```

Already covered in fase_2/09 as `SearchMessage`. Just confirming it maps directly.

### ReasoningItem (Codex-only)

```typescript
type ReasoningItem = {
  id: string;
  type: "reasoning";
  text: string;
};
```

Agent's chain-of-thought. Could render as a collapsible "thinking" block (similar to how Claude's extended thinking is shown).

### ErrorItem (Codex-only)

```typescript
type ErrorItem = {
  id: string;
  type: "error";
  message: string;
};
```

Non-fatal errors surfaced inline. Render as a warning/error banner within the message stream.

## Unified Item Type Mapping for Frontend

| Codex item type | Alive normalized type | Frontend component | Exists? |
|---|---|---|---|
| `agent_message` | `text` | `TextMessage` (existing) | ✅ |
| `command_execution` | `tool_use` | `ToolMessage` (existing) | ✅ |
| `file_change` | `file_change` | `FileChangeMessage` | ❌ New |
| `mcp_tool_call` | `mcp_tool` | `McpToolMessage` | ❌ New |
| `web_search` | `search` | `SearchMessage` | ❌ New |
| `todo_list` | `plan` | `TodoListMessage` | ❌ New |
| `reasoning` | `thinking` | `ThinkingMessage` | ⚠️ Adapt existing |
| `error` | `error` | `ErrorMessage` | ❌ New |

### Implementation Note

For v1, only `text`, `tool_use`/`command_execution`, and `file_change` are critical. The others can render as generic text blocks initially and get dedicated components in v2.
