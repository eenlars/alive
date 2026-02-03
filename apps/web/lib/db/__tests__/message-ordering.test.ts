/**
 * Message Ordering Tests
 *
 * Tests that messages are stored and displayed in the correct chronological order,
 * even when user messages and AI stream messages are interleaved.
 *
 * This specifically tests the fix for the race condition where a user's second message
 * could appear before the AI's responses to their first message.
 *
 * IMPORTANT: These tests use unique tab IDs per test to avoid queue state pollution
 * between tests (the tabWriteQueues Map persists at module level).
 *
 * TERMINOLOGY NOTE:
 * - In Dexie schema: DbTab.conversationId = tabGroupId (sidebar grouping)
 * - In Zustand Tab store: Tab.id IS the conversation key, Tab.tabGroupId is sidebar grouping
 * - The `tabId` parameter in addMessage() is the target tab (Tab.id = conversation key)
 */

import "fake-indexeddb/auto"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { UIMessage } from "@/features/chat/lib/message-parser"
import { useDexieMessageStore } from "../dexieMessageStore"
import { getMessageDb } from "../messageDb"

const TEST_USER_ID = "test-user-ordering"
const TEST_ORG_ID = "test-org-ordering"
const TEST_WORKSPACE = "ordering.test.com"

// Counter to generate unique tab IDs per test
let testCounter = 0

/**
 * Helper to set up the store with a session and a single tab.
 * Uses unique tab IDs to avoid queue state pollution between tests.
 *
 * Note: In Dexie, conversationId refers to the sidebar grouping (tabGroupId).
 * The tabId IS the Claude conversation key (single source of truth).
 */
async function setupTab() {
  testCounter++
  const tabId = `tab-main-${testCounter}`
  const tabGroupId = `tabgroup-main-${testCounter}`

  const store = useDexieMessageStore.getState()
  store.setSession({ userId: TEST_USER_ID, orgId: TEST_ORG_ID })
  const result = await store.ensureTabGroupWithTab(TEST_WORKSPACE, tabGroupId, tabId)
  return { conversationId: result.conversationId, tabId }
}

/**
 * Helper to create a user message.
 */
function userMessage(id: string, content: string): UIMessage {
  return {
    id,
    type: "user",
    content,
    timestamp: new Date(),
  }
}

/**
 * Helper to create an SDK message (tool_use, tool_result, etc.).
 */
function sdkMessage(id: string, content: object): UIMessage {
  return {
    id,
    type: "sdk_message",
    content,
    timestamp: new Date(),
  }
}

describe("message ordering", () => {
  beforeEach(() => {
    useDexieMessageStore.setState({
      session: null,
      currentTabGroupId: null,
      currentTabId: null,
      currentWorkspace: null,
      isLoading: false,
      isSyncing: false,
      activeStreamByTab: {},
      streamingBuffers: {},
    })
  })

  afterEach(async () => {
    const db = getMessageDb(TEST_USER_ID)
    await db.delete()
    await db.open()
  })

  it("should order messages by seq number, not insertion time", async () => {
    const { tabId } = await setupTab()
    const store = useDexieMessageStore.getState()
    const db = getMessageDb(TEST_USER_ID)

    // Add messages in sequence
    await store.addMessage(userMessage("msg-1", "First message"), tabId)
    await store.addMessage(sdkMessage("msg-2", { type: "tool_use", name: "Read" }), tabId)
    await store.addMessage(sdkMessage("msg-3", { type: "tool_result", content: "file content" }), tabId)
    await store.addMessage(userMessage("msg-4", "Second message"), tabId)

    // Query messages ordered by seq
    const messages = await db.messages.where("[tabId+seq]").between([tabId, 0], [tabId, Infinity]).toArray()

    expect(messages).toHaveLength(4)
    expect(messages[0].id).toBe("msg-1")
    expect(messages[1].id).toBe("msg-2")
    expect(messages[2].id).toBe("msg-3")
    expect(messages[3].id).toBe("msg-4")

    // Verify seq numbers are strictly increasing
    for (let i = 1; i < messages.length; i++) {
      expect(messages[i].seq).toBeGreaterThan(messages[i - 1].seq)
    }
  })

  it("should correctly order user message after AI streaming messages", async () => {
    const { tabId, conversationId } = await setupTab()
    const store = useDexieMessageStore.getState()
    const db = getMessageDb(TEST_USER_ID)

    // Ensure store knows the current conversation (required for startAssistantStream)
    store.switchConversation(conversationId, tabId)

    // Simulate the real flow:
    // 1. User sends message 1
    await store.addMessage(userMessage("user-msg-1", "What time is it?"), tabId)

    // 2. AI starts streaming response
    const streamId = await store.startAssistantStream(tabId)

    // 3. AI sends tool_use
    await store.addMessage(
      sdkMessage("tool-use-1", { type: "tool_use", name: "Bash", id: "tu-1", input: { command: "date" } }),
      tabId,
    )

    // 4. AI sends tool_result
    await store.addMessage(
      sdkMessage("tool-result-1", { type: "tool_result", tool_use_id: "tu-1", content: "Wed Jan 28 14:00:00 2026" }),
      tabId,
    )

    // 5. AI finishes streaming
    store.appendToAssistantStream(streamId, "The current time is 2:00 PM.")
    await store.finalizeAssistantStream(streamId)

    // 6. User sends message 2 (THIS IS THE KEY TEST - it should come AFTER all AI messages)
    await store.addMessage(userMessage("user-msg-2", "Thanks!"), tabId)

    // Query all messages in order
    const messages = await db.messages.where("[tabId+seq]").between([tabId, 0], [tabId, Infinity]).toArray()

    // Find the positions
    const userMsg1Idx = messages.findIndex(m => m.id === "user-msg-1")
    const streamMsgIdx = messages.findIndex(m => m.id === streamId)
    const toolUseIdx = messages.findIndex(m => m.id === "tool-use-1")
    const toolResultIdx = messages.findIndex(m => m.id === "tool-result-1")
    const userMsg2Idx = messages.findIndex(m => m.id === "user-msg-2")

    // Verify order: user1 < stream < tool_use < tool_result < user2
    expect(userMsg1Idx).toBeLessThan(streamMsgIdx)
    expect(streamMsgIdx).toBeLessThan(toolUseIdx)
    expect(toolUseIdx).toBeLessThan(toolResultIdx)
    expect(toolResultIdx).toBeLessThan(userMsg2Idx)

    // The key assertion: second user message comes AFTER all AI messages
    expect(userMsg2Idx).toBe(messages.length - 1)
  })

  it("should handle concurrent addMessage and startAssistantStream without seq collision", async () => {
    const { tabId, conversationId } = await setupTab()
    const store = useDexieMessageStore.getState()
    const db = getMessageDb(TEST_USER_ID)

    store.switchConversation(conversationId, tabId)

    // Fire off multiple operations concurrently (simulating race condition)
    // Note: With Promise.all, the ORDER within the batch is non-deterministic,
    // but each message should still get a UNIQUE seq number (no collisions).
    const [, streamId] = await Promise.all([
      store.addMessage(userMessage("concurrent-user", "Hello"), tabId),
      store.startAssistantStream(tabId),
      store.addMessage(sdkMessage("concurrent-sdk", { type: "thinking", text: "..." }), tabId),
    ])

    // Finalize stream
    await store.finalizeAssistantStream(streamId)

    // Query all messages
    const messages = await db.messages.where("[tabId+seq]").between([tabId, 0], [tabId, Infinity]).toArray()

    // All messages should have unique seq numbers (the key guarantee)
    const seqNumbers = messages.map(m => m.seq)
    const uniqueSeqNumbers = new Set(seqNumbers)
    expect(uniqueSeqNumbers.size).toBe(seqNumbers.length)

    // Seq numbers should be sequential (1, 2, 3) with no gaps
    const sortedSeqs = [...seqNumbers].sort((a, b) => a - b)
    expect(sortedSeqs[0]).toBe(1)
    expect(sortedSeqs[sortedSeqs.length - 1]).toBe(sortedSeqs.length)
  })

  it("should maintain order when rapidly sending user messages during AI stream", async () => {
    const { tabId, conversationId } = await setupTab()
    const store = useDexieMessageStore.getState()
    const db = getMessageDb(TEST_USER_ID)

    store.switchConversation(conversationId, tabId)

    // User message 1
    await store.addMessage(userMessage("rapid-1", "Question 1"), tabId)

    // AI starts responding
    const streamId = await store.startAssistantStream(tabId)
    store.appendToAssistantStream(streamId, "Starting response...")

    // Rapidly: AI tool + User message 2 + AI tool result (simulating fast typing)
    await store.addMessage(sdkMessage("rapid-tool", { type: "tool_use", name: "Read" }), tabId)
    await store.addMessage(userMessage("rapid-2", "Question 2"), tabId)
    await store.addMessage(sdkMessage("rapid-result", { type: "tool_result", content: "done" }), tabId)

    // AI finishes
    await store.finalizeAssistantStream(streamId)

    // User message 3
    await store.addMessage(userMessage("rapid-3", "Question 3"), tabId)

    // Get messages in order
    const messages = await db.messages.where("[tabId+seq]").between([tabId, 0], [tabId, Infinity]).toArray()
    const ids = messages.map(m => m.id)

    // Verify the order matches insertion order
    expect(ids).toEqual(["rapid-1", streamId, "rapid-tool", "rapid-2", "rapid-result", "rapid-3"])
  })

  it("should preserve order across multiple conversation turns", async () => {
    const { tabId, conversationId } = await setupTab()
    const store = useDexieMessageStore.getState()
    const db = getMessageDb(TEST_USER_ID)

    store.switchConversation(conversationId, tabId)

    // Turn 1: User asks, AI responds with tools
    await store.addMessage(userMessage("turn1-user", "Build a website"), tabId)
    const stream1 = await store.startAssistantStream(tabId)
    await store.addMessage(sdkMessage("turn1-tool1", { type: "tool_use", name: "Write" }), tabId)
    await store.addMessage(sdkMessage("turn1-result1", { type: "tool_result", content: "ok" }), tabId)
    store.appendToAssistantStream(stream1, "I created the file.")
    await store.finalizeAssistantStream(stream1)

    // Turn 2: User asks follow-up, AI responds
    await store.addMessage(userMessage("turn2-user", "Add a header"), tabId)
    const stream2 = await store.startAssistantStream(tabId)
    await store.addMessage(sdkMessage("turn2-tool1", { type: "tool_use", name: "Edit" }), tabId)
    await store.addMessage(sdkMessage("turn2-result1", { type: "tool_result", content: "ok" }), tabId)
    store.appendToAssistantStream(stream2, "Added the header.")
    await store.finalizeAssistantStream(stream2)

    // Turn 3: User confirms
    await store.addMessage(userMessage("turn3-user", "Perfect, thanks!"), tabId)

    // Get all messages
    const messages = await db.messages.where("[tabId+seq]").between([tabId, 0], [tabId, Infinity]).toArray()
    const ids = messages.map(m => m.id)

    // Verify complete order
    expect(ids).toEqual([
      "turn1-user",
      stream1,
      "turn1-tool1",
      "turn1-result1",
      "turn2-user",
      stream2,
      "turn2-tool1",
      "turn2-result1",
      "turn3-user",
    ])
  })
})
