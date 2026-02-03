import { SECURITY } from "@webalive/shared"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { isConversationLocked, tabKey, tryLockConversation, unlockConversation } from "@/features/auth/lib/sessionStore"
import { CLAUDE_MODELS } from "@/lib/models/claude-models"
import { setupAbortHandler } from "@/lib/stream/abort-handler"
import { createNDJSONStream } from "@/lib/stream/ndjson-stream-handler"

// Default test model
const TEST_MODEL = CLAUDE_MODELS.HAIKU_4_5

/**
 * HTTP Abort Integration Test
 *
 * Tests the REAL production flow:
 * 1. Frontend sends request with AbortController.signal
 * 2. Backend receives req.signal (Next.js request signal)
 * 3. User clicks stop → abortController.abort()
 * 4. HTTP request aborts → req.signal fires "abort" event
 * 5. abort-handler unlocks conversation
 * 6. User can send second message immediately
 *
 * This is the CRITICAL test that would have caught the "second message blocked" bug.
 */

describe("HTTP Abort → Second Message (Production Flow)", () => {
  const userId = SECURITY.LOCAL_TEST.SESSION_VALUE
  const workspace = "test-workspace"
  const tabId = "http-abort-test"
  const convKey = tabKey({ userId, tabGroupId: "test-tabgroup", tabId })

  beforeEach(() => {
    unlockConversation(convKey)
  })

  afterEach(() => {
    unlockConversation(convKey)
  })

  function createMockChildStream(events: Array<{ type: string; data?: unknown }>) {
    return new ReadableStream({
      start(controller) {
        for (const event of events) {
          const line = JSON.stringify(event)
          controller.enqueue(new TextEncoder().encode(`${line}\n`))
        }
        controller.close()
      },
    })
  }

  it("should unlock conversation when HTTP request is aborted", async () => {
    // Lock conversation (first request)
    const locked = tryLockConversation(convKey)
    expect(locked).toBe(true)

    // Create AbortController (simulates Next.js req.signal)
    const httpAbortController = new AbortController()

    const childStream = createMockChildStream([
      { type: "message", data: { content: "Thinking..." } },
      { type: "message", data: { content: "Still thinking..." } },
    ])

    const stream = createNDJSONStream({
      childStream,
      conversationKey: convKey,
      requestId: "http-abort-1",
      conversationWorkspace: workspace,
      tokenSource: "user_provided",
      model: TEST_MODEL,
      onStreamComplete: () => {
        unlockConversation(convKey)
      },
      cancelState: { requested: false, reader: null },
    })

    // Set up abort handler (what route handler does)
    setupAbortHandler({
      signal: httpAbortController.signal,
      stream,
      conversationKey: convKey,
      requestId: "http-abort-1",
    })

    // Verify lock is held
    expect(isConversationLocked(convKey)).toBe(true)

    // USER CLICKS STOP BUTTON → frontend calls abortController.abort()
    httpAbortController.abort()

    // Wait for abort handler to process
    await new Promise(resolve => setTimeout(resolve, 20))

    // CRITICAL: Lock should be released
    expect(isConversationLocked(convKey)).toBe(false)

    // USER IMMEDIATELY SENDS SECOND MESSAGE
    const locked2 = tryLockConversation(convKey)
    expect(locked2).toBe(true) // Should NOT be false (409)

    unlockConversation(convKey)
  })

  it("should handle abort → send → abort → send cycle", async () => {
    for (let i = 0; i < 3; i++) {
      // Lock for request i
      const locked = tryLockConversation(convKey)
      expect(locked).toBe(true)

      const httpAbortController = new AbortController()

      const childStream = createMockChildStream([{ type: "message", data: { content: `Request ${i}` } }])

      const stream = createNDJSONStream({
        childStream,
        conversationKey: convKey,
        requestId: `http-cycle-${i}`,
        conversationWorkspace: workspace,
        tokenSource: "user_provided",
        model: TEST_MODEL,
        onStreamComplete: () => {
          unlockConversation(convKey)
        },
        cancelState: { requested: false, reader: null },
      })

      setupAbortHandler({
        signal: httpAbortController.signal,
        stream,
        conversationKey: convKey,
        requestId: `http-cycle-${i}`,
      })

      // User clicks stop
      httpAbortController.abort()
      await new Promise(resolve => setTimeout(resolve, 20))

      // Lock should be released
      expect(isConversationLocked(convKey)).toBe(false)
    }
  })

  it("should handle simultaneous abort from multiple sources (defensive)", async () => {
    const locked = tryLockConversation(convKey)
    expect(locked).toBe(true)

    const httpAbortController = new AbortController()

    const childStream = createMockChildStream([{ type: "message", data: { content: "Test" } }])

    let _callbackFired = false

    const stream = createNDJSONStream({
      childStream,
      conversationKey: convKey,
      requestId: "multi-abort",
      conversationWorkspace: workspace,
      tokenSource: "user_provided",
      model: TEST_MODEL,
      onStreamComplete: () => {
        _callbackFired = true
        unlockConversation(convKey)
      },
      cancelState: { requested: false, reader: null },
    })

    setupAbortHandler({
      signal: httpAbortController.signal,
      stream,
      conversationKey: convKey,
      requestId: "multi-abort",
    })

    // Trigger abort (calls unlockConversation)
    httpAbortController.abort()
    await new Promise(resolve => setTimeout(resolve, 20))

    // Stream might also complete and call onStreamComplete (also unlocks)
    // Both paths call unlockConversation - should be idempotent

    expect(isConversationLocked(convKey)).toBe(false)
  })

  it("should differentiate between browser close vs stop button (both work)", async () => {
    // Test 1: Stop button (explicit abort)
    {
      const locked = tryLockConversation(convKey)
      expect(locked).toBe(true)

      const httpAbortController = new AbortController()

      const childStream = createMockChildStream([{ type: "message", data: { content: "Test" } }])

      const stream = createNDJSONStream({
        childStream,
        conversationKey: convKey,
        requestId: "stop-button",
        conversationWorkspace: workspace,
        tokenSource: "user_provided",
        model: TEST_MODEL,
        onStreamComplete: () => {
          unlockConversation(convKey)
        },
        cancelState: { requested: false, reader: null },
      })

      setupAbortHandler({
        signal: httpAbortController.signal,
        stream,
        conversationKey: convKey,
        requestId: "stop-button",
      })

      // User clicks stop button
      httpAbortController.abort()
      await new Promise(resolve => setTimeout(resolve, 20))

      expect(isConversationLocked(convKey)).toBe(false)
    }

    // Test 2: Browser close/navigation (also aborts)
    {
      const locked = tryLockConversation(convKey)
      expect(locked).toBe(true)

      const httpAbortController = new AbortController()

      const childStream = createMockChildStream([{ type: "message", data: { content: "Test" } }])

      const stream = createNDJSONStream({
        childStream,
        conversationKey: convKey,
        requestId: "browser-close",
        conversationWorkspace: workspace,
        tokenSource: "user_provided",
        model: TEST_MODEL,
        onStreamComplete: () => {
          unlockConversation(convKey)
        },
        cancelState: { requested: false, reader: null },
      })

      setupAbortHandler({
        signal: httpAbortController.signal,
        stream,
        conversationKey: convKey,
        requestId: "browser-close",
      })

      // Browser closes tab (also triggers abort)
      httpAbortController.abort()
      await new Promise(resolve => setTimeout(resolve, 20))

      expect(isConversationLocked(convKey)).toBe(false)
    }
  })

  it("should handle the exact user flow from the bug report", async () => {
    // 1. User sends first message
    console.log("Step 1: User sends first message")
    const locked1 = tryLockConversation(convKey)
    expect(locked1).toBe(true)
    expect(isConversationLocked(convKey)).toBe(true)

    const httpAbortController1 = new AbortController()

    const childStream1 = createMockChildStream([
      { type: "start", data: { message: "Starting..." } },
      { type: "message", data: { content: "I'm working on your request..." } },
      // Stream is still going when user clicks stop
    ])

    const stream1 = createNDJSONStream({
      childStream: childStream1,
      conversationKey: convKey,
      requestId: "user-flow-1",
      conversationWorkspace: workspace,
      tokenSource: "user_provided",
      model: TEST_MODEL,
      onStreamComplete: () => {
        console.log("Stream 1: onStreamComplete called")
        unlockConversation(convKey)
      },
      cancelState: { requested: false, reader: null },
    })

    setupAbortHandler({
      signal: httpAbortController1.signal,
      stream: stream1,
      conversationKey: convKey,
      requestId: "user-flow-1",
    })

    // 2. User waits a moment, then clicks stop button
    console.log("Step 2: User clicks stop button")
    await new Promise(resolve => setTimeout(resolve, 10))
    httpAbortController1.abort()
    await new Promise(resolve => setTimeout(resolve, 20))

    // 3. User expects to send second message immediately
    console.log("Step 3: User tries to send second message")
    expect(isConversationLocked(convKey)).toBe(false) // BUG: This was true!

    // 4. Second message should work
    console.log("Step 4: Second message should acquire lock")
    const locked2 = tryLockConversation(convKey)
    expect(locked2).toBe(true) // BUG: This was false (409)

    unlockConversation(convKey)
  })
})
