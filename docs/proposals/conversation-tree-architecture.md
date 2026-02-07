# Proposal: Conversation Tree Architecture

**Source**: Independent implementation based on standard tree/graph data structure patterns.
**Legal note**: Do not copy code from proprietary or reverse-engineered sources. If any external reference is reused, it must have a verified compatible license and explicit attribution.
**Value**: Enables branching conversations, message editing, regeneration, and variant navigation.

---

## The Problem

Our current conversation model is **linear** - messages are stored as a flat array:

```typescript
// Current: Linear array
const messages: Message[] = [
  { id: "1", role: "user", content: "Hello" },
  { id: "2", role: "assistant", content: "Hi there!" },
  { id: "3", role: "user", content: "Tell me a joke" },
  { id: "4", role: "assistant", content: "Why did..." },
]
```

This breaks down when users want to:
1. **Regenerate** a response → Where does the new response go?
2. **Edit** an earlier message → The entire conversation after that point is invalid
3. **Compare** alternate responses → Can't see "Response 1 of 3"

---

## The Solution: Tree-Based Conversations

ChatGPT stores conversations as **trees**, not arrays. Each message can have multiple children (variants).

```
                    [root]
                       │
                    [user: "Hello"]
                       │
           ┌──────────┼──────────┐
           │          │          │
    [assistant v1] [assistant v2] [assistant v3]  ← "Response 2 of 3"
           │
    [user: "Thanks"]
           │
    [assistant: "You're welcome"]
```

### Data Structure

```typescript
interface Conversation {
  id: string
  title: string
  create_time: number
  update_time: number
  mapping: Record<string, ConversationNode>  // All nodes by ID (normalized)
  current_node: string                        // Active leaf node
}

interface ConversationNode {
  id: string
  parent: string | null      // Parent node ID
  children: string[]         // Child node IDs (variants/branches)
  message: Message | null    // Null for root node
}

interface Message {
  id: string
  author: { role: "user" | "assistant" | "system" }
  content: { parts: string[] }
  create_time: number
  update_time?: number
  metadata?: Record<string, unknown>
}
```

### Key Operations

```typescript
// 1. Get current thread (linearized for display)
getCurrentThread(conversation): Message[]

// 2. Navigate between response variants
navigateToSibling(conversation, nodeId, "next" | "prev"): Conversation

// 3. Get variant position for UI ("2 of 3")
getSiblingIndex(mapping, nodeId): [index, total]

// 4. Add new message (returns new immutable mapping)
addNode(mapping, parentId, message): Record<string, ConversationNode>

// 5. Edit message (creates new branch as sibling)
editMessage(conversation, messageId, newContent): { conversation, newMessageId }

// 6. Regenerate response (find prompt, add new sibling response)
prepareForRegeneration(conversation, assistantMessageId): { conversation, promptNodeId }
```

---

## Why This Matters

### 1. Regeneration Actually Works

Without trees, regeneration is awkward:
- Delete old response? User loses context
- Append new response? Confusing mixed thread
- Replace in place? History gone

With trees:
```typescript
// User clicks "Regenerate" on assistant message
const { conversation, promptNodeId } = prepareForRegeneration(conv, assistantMsgId)
// promptNodeId is the parent user message
// New response becomes a sibling of the old one
// User can switch between them with arrows
```

### 2. Message Editing Creates Branches

```typescript
// User edits message 3 in a 10-message thread
const { conversation, newMessageId } = editMessage(conv, "msg-3", "New content")
// Creates branch from msg-2
// Old thread (msg-3 through msg-10) still exists
// User can navigate back to it
```

### 3. Immutable, Pure Functions

Every operation returns a **new** mapping. No mutations. This enables:
- Easy undo/redo
- Time-travel debugging
- Predictable state updates
- Safe concurrent operations

```typescript
// All operations are pure
const newMapping = addNode(mapping, parentId, message)  // Returns new object
const conversation = navigateToSibling(conv, nodeId, "next")  // Returns new object
```

### 4. Normalized Structure (Like Redux)

Nodes reference each other by ID, not nested objects:
```typescript
mapping: {
  "root": { id: "root", parent: null, children: ["msg-1"], message: null },
  "msg-1": { id: "msg-1", parent: "root", children: ["msg-2a", "msg-2b"], message: {...} },
  "msg-2a": { id: "msg-2a", parent: "msg-1", children: [], message: {...} },
  "msg-2b": { id: "msg-2b", parent: "msg-1", children: [], message: {...} },
}
```

Benefits:
- O(1) node lookups
- Easy to update any node
- No deep cloning needed
- Memory efficient

---

## Implementation Cost vs Value

| Aspect | Cost | Value |
|--------|------|-------|
| Core library | ~400-600 lines (first-principles implementation) | High - proven model class |
| Type changes | Moderate - new Conversation type | High - cleaner data model |
| UI changes | Medium - add variant nav arrows | High - major UX improvement |
| DB migration | Medium - new schema | Low risk - additive change |
| Backend changes | Low - just store tree | Low - simpler than arrays |

---

## Recommended Approach

### Phase 1: Core Library
Implement `lib/conversation-tree.ts` from first principles:
- Pure functions, zero dependencies
- Full TypeScript types
- Works standalone
- Add unit tests for branch traversal, sibling navigation, edit branching, and regeneration cursor logic

### Phase 2: Backend Support
Update conversation storage:
```typescript
// Before: { messages: Message[] }
// After: { mapping: Record<string, ConversationNode>, current_node: string }
```

### Phase 3: UI Integration
Add to chat interface:
- Variant navigation arrows ("< 2/3 >")
- Regenerate creates sibling branch
- Edit creates new branch

---

## Migration & Deployment

### Data Migration Strategy

Use **lazy migration on read** with dual-shape support during rollout:

1. If payload is already tree-shaped (`mapping` + `current_node`), use it directly.
2. If payload is linear (`messages[]`), convert at read time into a tree:
   - Create root node.
   - Append each message as a single-child chain.
   - Set `current_node` to final message node.
3. Persist migrated tree on next write to avoid repeated conversion.
4. After rollout stability, run a background backfill and remove linear fallback in a later release.

### Concurrency Control

Use optimistic concurrency at conversation-row level:

- Store a `version` (or `updated_at`) with each conversation.
- Writes must include expected version.
- On mismatch, reject with conflict and require client rebase/retry.
- For conflicting edits to same node, preserve both by creating sibling branches instead of overwriting.

### API Compatibility

- Keep existing endpoint paths.
- Add a `conversation_format` field (`"linear"` | `"tree"`) during transition.
- Clients that only support linear can continue reading legacy until migration completes.
- New clients should prefer tree payloads and degrade gracefully if linear appears.

### Performance / Scale

- Normalize nodes by ID (`mapping`) for O(1) lookup.
- Cap loaded branch depth in UI when rendering large threads.
- Add DB indexes for `conversation_id`, `updated_at`, and optional `current_node`.
- Keep branch traversal in memory per request; avoid N+1 node fetches.

### Rollout and Rollback

1. Ship read support for both formats.
2. Ship write support in tree format behind feature flag.
3. Enable for internal users first, then progressively widen.
4. Roll back by disabling tree writes (linear reads remain functional during transition).

---

## Full Implementation Reference

Illustrative implementation sketch (first-principles pseudocode):

```typescript
/**
 * Conversation tree utilities
 * Implemented from standard tree operations (no external code copy).
 */

export const CLIENT_ROOT_ID = "client-created-root"

// Get node by ID
export function getNode(
  mapping: Record<string, ConversationNode>,
  nodeId: string,
): ConversationNode | null {
  return mapping[nodeId] ?? null
}

// Get path from root to node (the "branch")
export function getBranch(
  mapping: Record<string, ConversationNode>,
  nodeId: string,
): string[] {
  const branch: string[] = []
  let currentId: string | null = nodeId

  while (currentId) {
    const node = getNode(mapping, currentId)
    if (!node) break
    branch.unshift(currentId)
    currentId = node.parent
  }

  return branch
}

// Get messages in current thread (for display)
export function getCurrentThread(conversation: Conversation): Message[] {
  const branch = getBranch(conversation.mapping, conversation.current_node)
  return branch
    .map((id) => conversation.mapping[id]?.message)
    .filter((msg): msg is Message => msg !== null)
}

// Get siblings (variants) of a node
export function getSiblings(
  mapping: Record<string, ConversationNode>,
  nodeId: string,
): string[] {
  const node = getNode(mapping, nodeId)
  if (!node?.parent) return [nodeId]

  const parent = getNode(mapping, node.parent)
  return parent?.children ?? [nodeId]
}

// Get position among siblings [index, total]
export function getSiblingIndex(
  mapping: Record<string, ConversationNode>,
  nodeId: string,
): [number, number] {
  const siblings = getSiblings(mapping, nodeId)
  const index = siblings.indexOf(nodeId)
  return [index === -1 ? 0 : index, siblings.length]
}

// Add message node (immutable)
export function addNode(
  mapping: Record<string, ConversationNode>,
  parentId: string,
  message: Message,
): Record<string, ConversationNode> {
  const newMapping = { ...mapping }

  newMapping[message.id] = {
    id: message.id,
    parent: parentId,
    children: [],
    message,
  }

  const parent = newMapping[parentId]
  if (parent) {
    newMapping[parentId] = {
      ...parent,
      children: [...parent.children, message.id],
    }
  }

  return newMapping
}

// Navigate to sibling (with wrap-around)
export function navigateToSibling(
  conversation: Conversation,
  nodeId: string,
  direction: "prev" | "next",
): Conversation {
  const [index, total] = getSiblingIndex(conversation.mapping, nodeId)
  const siblings = getSiblings(conversation.mapping, nodeId)

  let newIndex: number
  if (direction === "prev") {
    newIndex = index > 0 ? index - 1 : total - 1
  } else {
    newIndex = index < total - 1 ? index + 1 : 0
  }

  const newNodeId = siblings[newIndex]
  if (!newNodeId || newNodeId === nodeId) return conversation

  // Find deepest leaf of new branch
  let deepest = newNodeId
  let node = getNode(conversation.mapping, deepest)
  while (node && node.children.length > 0) {
    deepest = node.children[node.children.length - 1]
    node = getNode(conversation.mapping, deepest)
  }

  return { ...conversation, current_node: deepest }
}

// Create empty conversation
export function createEmptyConversation(id: string): Conversation {
  return {
    id,
    title: "New chat",
    create_time: Date.now() / 1000,
    update_time: Date.now() / 1000,
    mapping: {
      [CLIENT_ROOT_ID]: {
        id: CLIENT_ROOT_ID,
        parent: null,
        children: [],
        message: null,
      },
    },
    current_node: CLIENT_ROOT_ID,
  }
}

// Edit message (creates new branch)
export function editMessage(
  conversation: Conversation,
  messageId: string,
  newContent: string,
): { conversation: Conversation; newMessageId: string } {
  const node = getNode(conversation.mapping, messageId)
  if (!node?.message || !node.parent) {
    return { conversation, newMessageId: messageId }
  }

  const newMessageId = crypto.randomUUID()
  const newMessage: Message = {
    ...node.message,
    id: newMessageId,
    content: { ...node.message.content, parts: [newContent] },
    create_time: Date.now() / 1000,
  }

  const newMapping = addNode(conversation.mapping, node.parent, newMessage)

  return {
    conversation: {
      ...conversation,
      mapping: newMapping,
      current_node: newMessageId,
      update_time: Date.now() / 1000,
    },
    newMessageId,
  }
}

// Prepare for regeneration
export function prepareForRegeneration(
  conversation: Conversation,
  assistantMessageId: string,
): { conversation: Conversation; promptNodeId: string | null } {
  // Find parent user message
  let current = getNode(conversation.mapping, assistantMessageId)
  while (current?.parent) {
    const parent = getNode(conversation.mapping, current.parent)
    if (parent?.message?.author.role === "user") {
      return {
        conversation: {
          ...conversation,
          current_node: parent.id,
          update_time: Date.now() / 1000,
        },
        promptNodeId: parent.id,
      }
    }
    current = parent
  }
  return { conversation, promptNodeId: null }
}
```

---

## Conclusion

This is not a feature - it's a **foundational data structure** that unlocks multiple features:
- Response regeneration
- Message editing
- Conversation branching
- Variant comparison

The model is well-understood, pure-functional, and portable.

**Recommendation**: Adopt this as the core conversation model for Alive.
