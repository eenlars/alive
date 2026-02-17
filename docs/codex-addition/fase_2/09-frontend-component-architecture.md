# Fase 2.9 — Frontend Component Architecture for Multi-Provider

## Current Message Renderer Architecture

Alive uses a message router pattern in `features/chat/lib/message-renderer.tsx` that dispatches to type-specific renderers:

```
message-renderer.tsx (router)
├── AssistantMessage.tsx     — agent text responses
├── ToolResultMessage.tsx    — tool execution results
├── ToolProgressMessage.tsx  — in-progress tool calls
├── ResultMessage.tsx        — query completion
├── ErrorResultMessage.tsx   — query errors
├── StartMessage.tsx         — session start
├── SystemMessage.tsx        — system events
├── UserMessage.tsx          — user input
├── InterruptMessage.tsx     — abort/cancel
├── AuthStatusMessage.tsx    — auth state changes
├── AgentManagerMessage.tsx  — agent lifecycle
├── CompleteMessage.tsx      — completion status
├── CollapsibleToolGroup.tsx — grouped tool calls
└── ChatAttachments.tsx      — file/image attachments
```

These currently render Claude-specific message shapes. For multi-provider support, we need:

1. Provider-agnostic message types the router understands
2. New renderers for Codex-specific item types
3. Provider badge/indicator on messages

## Strategy: Normalize in Worker, Not Frontend

The frontend should NOT know about provider-specific message formats. The worker's provider adapter already maps to `AgentEvent` — the frontend receives the same IPC format regardless of provider.

**Key insight:** The `AgentEvent.content.raw` field carries the original provider message. Frontend renderers check `raw.type` to decide rendering. We need to either:

A. Fully normalize `raw` to a universal shape (more work, cleaner)
B. Have renderers handle both shapes (less work, messier)

**Recommendation: Option A** — normalize in the provider adapter. The frontend gets a clean, universal message format.

## Universal Message Shape

```typescript
// packages/shared/src/stream-message.ts

type StreamMessage =
  | { kind: "text"; text: string; provider: "claude" | "codex" }
  | { kind: "tool_call"; tool: string; input: unknown; id: string; provider: string }
  | { kind: "tool_result"; id: string; output: string; isError: boolean; provider: string }
  | { kind: "thinking"; text: string; provider: string }
  | { kind: "plan"; items: Array<{ text: string; done: boolean }>; provider: string }
  | { kind: "search"; query: string; provider: string }
  | { kind: "file_change"; changes: Array<{ path: string; action: "add" | "update" | "delete" }>; provider: string }
  | { kind: "init"; tools: string[]; mcpStatus: unknown; provider: string }
  | { kind: "complete"; success: boolean; usage?: Usage; provider: string }
  | { kind: "error"; message: string; provider: string }
```

The `provider` field on every message enables the frontend to show badges and adjust styling.

## New Renderers Needed

### `PlanMessage.tsx` — for Codex `todo_list` items
```tsx
function PlanMessage({ items }: { items: Array<{ text: string; done: boolean }> }) {
  return (
    <div className="plan-message">
      <div className="plan-header">📋 Agent Plan</div>
      {items.map((item, i) => (
        <div key={i} className={`plan-item ${item.done ? "done" : ""}`}>
          {item.done ? "✅" : "⬜"} {item.text}
        </div>
      ))}
    </div>
  )
}
```

### `SearchMessage.tsx` — for Codex `web_search` items
```tsx
function SearchMessage({ query }: { query: string }) {
  return (
    <div className="search-message">
      🔍 Searched: <em>{query}</em>
    </div>
  )
}
```

### `FileChangeMessage.tsx` — for Codex `file_change` items
Codex provides structured file changes separate from tool calls. Different from Claude's Edit tool (which is a regular tool_call → tool_result).

```tsx
function FileChangeMessage({ changes }: { changes: FileChange[] }) {
  return (
    <div className="file-changes">
      <div className="file-changes-header">📝 File Changes</div>
      {changes.map((change, i) => (
        <div key={i} className="file-change-item">
          {change.action === "add" && "+"} 
          {change.action === "delete" && "−"} 
          {change.action === "update" && "~"} 
          <code>{change.path}</code>
          <span className="file-change-action">({change.action})</span>
        </div>
      ))}
    </div>
  )
}
```

### `ProviderBadge.tsx` — subtle provider indicator

```tsx
function ProviderBadge({ provider }: { provider: "claude" | "codex" }) {
  const config = {
    claude: { color: "#D97706", label: "Claude", icon: "🟠" },
    codex: { color: "#10B981", label: "Codex", icon: "🟢" },
  }
  const { color, label } = config[provider]
  return (
    <span className="provider-badge" style={{ color }}>
      {label}
    </span>
  )
}
```

## Modified Router

```tsx
// message-renderer.tsx changes:
function renderMessage(msg: StreamMessage) {
  switch (msg.kind) {
    case "text": return <AssistantMessage {...msg} />
    case "tool_call": return <ToolProgressMessage {...msg} />
    case "tool_result": return <ToolResultMessage {...msg} />
    case "thinking": return <ThinkingMessage {...msg} />
    case "plan": return <PlanMessage {...msg} />          // NEW
    case "search": return <SearchMessage {...msg} />      // NEW
    case "file_change": return <FileChangeMessage {...msg} />  // NEW
    case "init": return <StartMessage {...msg} />
    case "complete": return <CompleteMessage {...msg} />
    case "error": return <ErrorResultMessage {...msg} />
    default: return null
  }
}
```

## Workspace Settings UI

### Provider Selector Component

Location: `features/workspace/components/ProviderSettings.tsx`

```tsx
function ProviderSettings({ workspace }) {
  return (
    <div className="provider-settings">
      <h3>Agent Provider</h3>
      
      <RadioGroup value={workspace.agentProvider} onChange={updateProvider}>
        <RadioOption value="claude">
          <span>Claude (Anthropic)</span>
          {workspace.hasAnthropicAuth 
            ? <Badge variant="success">Connected</Badge>
            : <Button size="sm" onClick={connectAnthropic}>Connect</Button>
          }
        </RadioOption>
        
        <RadioOption value="codex">
          <span>Codex (OpenAI)</span>
          {workspace.hasOpenaiKey
            ? <Badge variant="success">API Key Set</Badge>
            : <ApiKeyInput onSave={saveOpenaiKey} placeholder="sk-..." />
          }
        </RadioOption>
      </RadioGroup>
      
      <ModelSelector provider={workspace.agentProvider} />
      
      {workspace.agentProvider === "codex" && (
        <div className="provider-notice">
          ⚠️ Codex runs in full-auto mode — all tool calls are auto-approved.
        </div>
      )}
    </div>
  )
}
```

### Model Selector (filtered by provider)

```tsx
const MODEL_CATALOG = {
  claude: [
    { id: "claude-opus-4", label: "Claude Opus 4", tier: "premium" },
    { id: "claude-sonnet-4", label: "Claude Sonnet 4", tier: "standard" },
    { id: "claude-haiku-3.5", label: "Claude Haiku 3.5", tier: "fast" },
  ],
  codex: [
    { id: "codex-1", label: "Codex-1", tier: "standard" },
    { id: "gpt-5.1", label: "GPT-5.1", tier: "premium" },
    { id: "o3", label: "o3", tier: "reasoning" },
  ],
}

function ModelSelector({ provider }) {
  const models = MODEL_CATALOG[provider] || []
  return (
    <Select>
      {models.map(m => <Option key={m.id} value={m.id}>{m.label}</Option>)}
    </Select>
  )
}
```

## Chat Input Provider Indicator

Small badge in the input area showing active provider:

```tsx
// ChatInput.tsx modification:
<div className="chat-input-container">
  <ProviderBadge provider={workspace.agentProvider} />
  <InputArea ... />
  <SendButton ... />
</div>
```

## Files to Create/Modify

### New files:
- `features/chat/components/message-renderers/PlanMessage.tsx`
- `features/chat/components/message-renderers/SearchMessage.tsx`
- `features/chat/components/message-renderers/FileChangeMessage.tsx`
- `features/chat/components/ui/ProviderBadge.tsx`
- `features/workspace/components/ProviderSettings.tsx`

### Modified files:
- `features/chat/lib/message-renderer.tsx` — add new message kinds
- `features/chat/components/ChatInput/ChatInput.tsx` — provider badge
- `features/workspace/components/WorkspaceSettings.tsx` — include ProviderSettings
- `packages/shared/src/stream-message.ts` — universal message types (if exists)

## Effort Estimate

| Task | Time |
|------|------|
| Universal message types | 1h |
| PlanMessage renderer | 1h |
| SearchMessage renderer | 0.5h |
| FileChangeMessage renderer | 1h |
| ProviderBadge | 0.5h |
| ProviderSettings (workspace) | 2h |
| Model catalog + selector | 1h |
| Chat input indicator | 0.5h |
| Message router updates | 1h |
| **Total** | **~8.5h** |
