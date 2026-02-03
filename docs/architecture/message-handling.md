# Message Handling & Streaming

SSE streaming, tool tracking, message grouping, and UI rendering patterns.

## Overview

Claude Bridge uses Server-Sent Events (SSE) for real-time streaming of Claude's responses, tool executions, and thinking process. Messages flow from SDK → SSE stream → client parser → UI renderer.

## SSE Event Types

Events streamed in order:

```typescript
type BridgeStreamType =
  | "start"      // Conversation initialization
  | "message"    // SDK message (assistant/user/thinking/tool)
  | "session"    // Session ID for resumption
  | "complete"   // Final completion with result
  | "error"      // Error information
  | "done"       // Stream end marker
```

## Streaming Flow

### Server Side (`app/api/claude/stream/route.ts`)

```typescript
// 1. Create ReadableStream
const stream = new ReadableStream({
  async start(controller) {
    // Send start event
    controller.enqueue(`data: ${JSON.stringify({
      type: "start",
      conversationId,
      workspace
    })}\n\n`)

    // 2. Iterate SDK messages
    for await (const msg of sdk.query(prompt, options)) {
      // Send message event
      controller.enqueue(`data: ${JSON.stringify({
        type: "message",
        message: msg
      })}\n\n`)
    }

    // 3. Send completion
    controller.enqueue(`data: ${JSON.stringify({
      type: "complete",
      result
    })}\n\n`)

    // 4. Close stream
    controller.close()
  }
})

// 5. Return SSE response
return new Response(stream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'  // Disable nginx buffering
  }
})
```

### Client Side (`features/chat/lib/streamHandler.ts`)

```typescript
// 1. Parse SSE events
const lines = chunk.split('\n')
for (const line of lines) {
  if (line.startsWith('data: ')) {
    const event = JSON.parse(line.slice(6))

    switch (event.type) {
      case 'start':
        // Initialize conversation
        break

      case 'message':
        // Process SDK message
        handleMessage(event.message)
        break

      case 'complete':
        // Finalize conversation
        break

      case 'error':
        // Handle error
        break
    }
  }
}
```

## Tool Tracking Pattern

### Problem

SDK messages are interleaved:
```
assistant → tool_use (id: "xyz", name: "Read")
user → tool_result (tool_use_id: "xyz", content: "file contents")
```

Tool results reference tool_use_id but don't include tool name. UI needs tool name for proper rendering.

### Solution: toolUseMap

**Build map during streaming:**

```typescript
const toolUseMap = new Map<string, string>()

function handleMessage(msg: Message) {
  if (msg.role === 'assistant' && msg.content) {
    for (const block of msg.content) {
      if (block.type === 'tool_use') {
        // Store tool_use_id → tool_name mapping
        toolUseMap.set(block.id, block.name)
      }
    }
  }

  if (msg.role === 'user' && msg.content) {
    for (const block of msg.content) {
      if (block.type === 'tool_result') {
        // Look up tool name from tool_use_id
        const toolName = toolUseMap.get(block.tool_use_id)
        // Now we can render with tool name
      }
    }
  }
}
```

**Result:** Every tool_result knows its tool name for rendering.

## Message Grouping

### Purpose

Batch consecutive messages of same type for better UX:

```
Before grouping:
- Text message
- Text message
- Text message
- Thinking block
- Tool use
- Tool result

After grouping:
- [Text messages grouped]
- [Thinking + tools grouped]
```

### Implementation (`features/chat/lib/message-grouper.ts`)

```typescript
export function groupMessages(messages: UIMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = []
  let currentGroup: MessageGroup | null = null

  for (const msg of messages) {
    const groupType = getGroupType(msg)

    if (!currentGroup || currentGroup.type !== groupType) {
      // Start new group
      currentGroup = { type: groupType, messages: [msg] }
      groups.push(currentGroup)
    } else {
      // Add to current group
      currentGroup.messages.push(msg)
    }
  }

  return groups
}

function getGroupType(msg: UIMessage): 'text' | 'tools' {
  if (msg.role === 'thinking') return 'tools'
  if (msg.role === 'tool_use' || msg.role === 'tool_result') return 'tools'
  return 'text'
}
```

### Flush on Completion

Groups are flushed when conversation completes:

```typescript
case 'complete':
  // Flush any pending groups
  setMessageGroups(groupMessages(allMessages))
  setIsStreaming(false)
```

## Message Rendering

### Component Dispatch (`features/chat/lib/message-renderer.tsx`)

```typescript
export function renderMessage(msg: UIMessage): ReactNode {
  switch (msg.role) {
    case 'user':
      return <UserMessage message={msg} />

    case 'assistant':
      return <AssistantMessage message={msg} />

    case 'thinking':
      return <ThinkingBlock content={msg.content} />

    case 'tool_use':
      return <ToolUse tool={msg} />

    case 'tool_result':
      const toolName = toolUseMap.get(msg.tool_use_id)
      return <ToolResult result={msg} toolName={toolName} />

    case 'system':
      return <SystemMessage message={msg} />

    default:
      return <UnknownMessage message={msg} />
  }
}
```

### Tool Input Visibility

Tool inputs hidden by default (debug mode only):

```typescript
<ToolUse tool={tool}>
  {debugMode && (
    <pre className="text-xs">{JSON.stringify(tool.input, null, 2)}</pre>
  )}
</ToolUse>
```

**Rationale:** Users care about results, not implementation details.

## Conversation Locking

### Problem

Concurrent requests to same conversation cause race conditions:
- Message order corruption
- Session conflicts
- Duplicate tool executions

### Solution

```typescript
const activeConversations = new Set<string>()

export async function POST(req: Request) {
  const conversationKey = `${userId}::${workspace}::${conversationId}`

  // Check if conversation in progress
  if (activeConversations.has(conversationKey)) {
    return Response.json(
      { error: 'Conversation in progress' },
      { status: 409 }
    )
  }

  // Lock conversation
  activeConversations.add(conversationKey)

  try {
    // Run SDK query
    for await (const msg of sdk.query(...)) {
      // Stream messages
    }
  } finally {
    // Always unlock, even on error
    activeConversations.delete(conversationKey)
  }
}
```

## Session Persistence

### Session Store Interface

```typescript
interface SessionStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}
```

### Session Resume Flow

```typescript
const sessionKey = `${userId}::${workspace}::${conversationId}`

// 1. Check for existing session
const sessionId = await sessionStore.get(sessionKey)

// 2. Resume if session exists
const response = await sdk.query(prompt, {
  sessionId,  // SDK skips tool re-execution
  ...options
})

// 3. Store new session ID
await sessionStore.set(sessionKey, response.sessionId)
```

**Benefits:**
- Resume conversations after browser close
- Maintain context across sessions
- Skip redundant tool executions

**⚠️ Current Implementation:** In-memory store (loses sessions on restart). Use Redis/DB for production.

## Attachments & User Prompts

### Attachment Types

```typescript
type Attachment =
  | { type: 'image', source: ImageSource }
  | { type: 'supertemplate', template: Template }
  | { type: 'user-prompt', prompt: UserPrompt }
  | { type: 'file-upload', file: File }
```

### Prompt Building Order

```typescript
function buildPrompt(message: string, attachments: Attachment[]): string {
  const parts: string[] = []

  // 1. User prompts (prepended)
  for (const att of attachments) {
    if (att.type === 'user-prompt') {
      parts.push(att.prompt.fullContent)
    }
  }

  // 2. User message
  parts.push(message)

  // 3. Images
  for (const att of attachments) {
    if (att.type === 'image') {
      parts.push(formatImageAttachment(att))
    }
  }

  // 4. SuperTemplates
  for (const att of attachments) {
    if (att.type === 'supertemplate') {
      parts.push(att.template.content)
    }
  }

  return parts.join('\n\n')
}
```

### Duplicate Detection

```typescript
// Hash-based for files
const fileHash = await hashFile(file)
if (attachments.some(a => a.hash === fileHash)) return

// Key-based for images
if (attachments.some(a => a.type === 'image' && a.key === newImage.key)) return

// Type-based for prompts (one per type)
if (attachments.some(a => a.type === 'user-prompt' && a.id === newPrompt.id)) return
```

## Error Handling

### Stream Errors

```typescript
try {
  for await (const msg of sdk.query(...)) {
    // Stream messages
  }
} catch (error) {
  // Send error event
  controller.enqueue(`data: ${JSON.stringify({
    type: "error",
    error: error.message
  })}\n\n`)
} finally {
  // Always send done event
  controller.enqueue(`data: ${JSON.stringify({
    type: "done"
  })}\n\n`)
  controller.close()
}
```

### Client Error Handling

```typescript
case 'error':
  setError(event.error)
  setIsStreaming(false)
  break
```

## Performance Considerations

### Buffering Prevention

```typescript
// Disable nginx buffering for real-time SSE
headers: {
  'X-Accel-Buffering': 'no',
  'Cache-Control': 'no-cache, no-transform'
}
```

### Message Batching

```typescript
// Batch UI updates to prevent excessive re-renders
const [messageBuffer, setMessageBuffer] = useState<UIMessage[]>([])

useEffect(() => {
  const flush = () => {
    setMessages(prev => [...prev, ...messageBuffer])
    setMessageBuffer([])
  }

  const timer = setTimeout(flush, 50)  // Flush every 50ms
  return () => clearTimeout(timer)
}, [messageBuffer])
```

## See Also

- [Architecture: Session Management](./session-management.md) - Detailed session patterns
- [Testing: Stream Tests](../testing/integration-testing.md#stream-tests) - How to test streaming
- [Features: User Prompts](../features/user-prompts.md) - Prompt template system
