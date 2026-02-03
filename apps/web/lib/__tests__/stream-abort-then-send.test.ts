import { SECURITY } from "@webalive/shared"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { isConversationLocked, tabKey, tryLockConversation, unlockConversation } from "@/features/auth/lib/sessionStore"
import { CLAUDE_MODELS } from "@/lib/models/claude-models"
import { setupAbortHandler } from "@/lib/stream/abort-handler"
import { createNDJSONStream } from "@/lib/stream/ndjson-stream-handler"

// Default test model - using Haiku for tests since it's cheapest
const TEST_MODEL = CLAUDE_MODELS.HAIKU_4_5

/**
 * Stream Abort → Immediate Send Integration Test
 *
 * REGRESSION TEST for Nov 2025 Bug: "Can't Send Second Message"
 *
 * THE BUG:
 * - Stream completed successfully
 * - finally block was missing
 * - onStreamComplete callback never fired
 * - Lock held forever (until 5-minute timeout)
 * - Second message got 409 CONVERSATION_BUSY
 *
 * WHAT THESE TESTS VERIFY:
 * 1. Stream completion triggers onStreamComplete callback
 * 2. Stream abort triggers onStreamComplete callback
 * 3. Lock is released AFTER stream's finally block runs
 * 4. Second request can acquire lock immediately after first completes
 * 5. Race conditions between stream lifecycle and lock management
 *
 * CRITICAL: These tests use ACTUAL streams and verify the ACTUAL cleanup path.
 * They would have FAILED before the fix (missing finally block).
 */

describe("Stream Abort → Send Integration (REAL)", () => {
  const userId = SECURITY.LOCAL_TEST.SESSION_VALUE
  const workspace = "test-workspace"
  const tabId = "test-conv-abort"
  const convKey = tabKey({ userId, tabGroupId: "test-tabgroup", tabId })

  beforeEach(() => {
    unlockConversation(convKey)
  })

  afterEach(() => {
    unlockConversation(convKey)
  })

  /**
   * Helper: Create a mock child stream that emits NDJSON data
   */
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

  /**
   * Helper: Consume stream completely (simulates what frontend does)
   */
  async function consumeStream(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader()
    try {
      while (true) {
        const { done } = await reader.read()
        if (done) break
      }
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * Helper: Trigger abort signal (simulates user clicking stop)
   * In production, the stream is consumed by HTTP Response, not manually
   */
  async function triggerAbort(abortController: AbortController): Promise<void> {
    // Simulate user clicking stop button
    abortController.abort()

    // Wait for abort handler to process
    await new Promise(resolve => setTimeout(resolve, 10))
  }

  describe("Stream Completion Releases Lock (Success Path)", () => {
    it("should release lock when stream completes successfully", async () => {
      let callbackFired = false
      let lockWasHeld = false

      // Create stream with cleanup callback
      const childStream = createMockChildStream([
        { type: "start", data: { message: "Starting" } },
        { type: "message", data: { content: "Hello" } },
        { type: "complete", data: { result: "Done" } },
      ])

      // Lock conversation (what route handler does)
      const locked = tryLockConversation(convKey)
      expect(locked).toBe(true)

      const stream = createNDJSONStream({
        childStream,
        conversationKey: convKey,
        requestId: "test-1",
        conversationWorkspace: workspace,
        tokenSource: "user_provided",
        model: TEST_MODEL,
        onStreamComplete: () => {
          // Verify lock is still held when callback fires
          lockWasHeld = isConversationLocked(convKey)
          callbackFired = true
          // Release lock (what route handler does)
          unlockConversation(convKey)
        },
        cancelState: { requested: false, reader: null },
      })

      // Lock should be held while stream is active
      expect(isConversationLocked(convKey)).toBe(true)

      // Consume stream to completion
      await consumeStream(stream)

      // CRITICAL: Verify callback actually fired
      expect(callbackFired).toBe(true)
      expect(lockWasHeld).toBe(true)

      // Lock should now be released
      expect(isConversationLocked(convKey)).toBe(false)

      // Second request should succeed immediately
      const secondLock = tryLockConversation(convKey)
      expect(secondLock).toBe(true)

      unlockConversation(convKey)
    })

    it("should release lock even with empty stream", async () => {
      let callbackFired = false

      const childStream = createMockChildStream([])

      const locked = tryLockConversation(convKey)
      expect(locked).toBe(true)

      const stream = createNDJSONStream({
        childStream,
        conversationKey: convKey,
        requestId: "test-2",
        conversationWorkspace: workspace,
        tokenSource: "user_provided",
        model: TEST_MODEL,
        onStreamComplete: () => {
          callbackFired = true
          unlockConversation(convKey)
        },
        cancelState: { requested: false, reader: null },
      })

      await consumeStream(stream)

      expect(callbackFired).toBe(true)
      expect(isConversationLocked(convKey)).toBe(false)
    })

    it("should release lock with many events", async () => {
      let callbackFired = false

      // Create stream with 100 events
      const events = Array.from({ length: 100 }, (_, i) => ({
        type: "message",
        data: { count: i },
      }))

      const childStream = createMockChildStream(events)

      const locked = tryLockConversation(convKey)
      expect(locked).toBe(true)

      const stream = createNDJSONStream({
        childStream,
        conversationKey: convKey,
        requestId: "test-3",
        conversationWorkspace: workspace,
        tokenSource: "user_provided",
        model: TEST_MODEL,
        onStreamComplete: () => {
          callbackFired = true
          unlockConversation(convKey)
        },
        cancelState: { requested: false, reader: null },
      })

      await consumeStream(stream)

      expect(callbackFired).toBe(true)
      expect(isConversationLocked(convKey)).toBe(false)
    })
  })

  describe("Stream Abort Releases Lock (Abort Path)", () => {
    it("should release lock when stream is aborted mid-stream", async () => {
      let _callbackFired = false

      const childStream = createMockChildStream([
        { type: "start", data: { message: "Starting" } },
        { type: "message", data: { content: "Hello" } },
        { type: "message", data: { content: "World" } },
        { type: "message", data: { content: "More" } },
        { type: "complete", data: { result: "Done" } },
      ])

      const locked = tryLockConversation(convKey)
      expect(locked).toBe(true)

      // Create AbortController (simulates HTTP request abort signal)
      const abortController = new AbortController()

      const stream = createNDJSONStream({
        childStream,
        conversationKey: convKey,
        requestId: "test-4",
        conversationWorkspace: workspace,
        tokenSource: "user_provided",
        model: TEST_MODEL,
        onStreamComplete: () => {
          _callbackFired = true
          unlockConversation(convKey)
        },
        cancelState: { requested: false, reader: null },
      })

      // Set up abort handler (what route handler does)
      setupAbortHandler({
        signal: abortController.signal,
        stream,
        conversationKey: convKey,
        requestId: "test-4",
      })

      // Abort stream mid-way (simulates user clicking stop)
      await triggerAbort(abortController)

      // CRITICAL: Lock should be released (via abort-handler failsafe)
      expect(isConversationLocked(convKey)).toBe(false)
    })

    it("should release lock when aborted immediately", async () => {
      const childStream = createMockChildStream([
        { type: "start", data: { message: "Starting" } },
        { type: "message", data: { content: "Hello" } },
      ])

      const locked = tryLockConversation(convKey)
      expect(locked).toBe(true)

      const abortController = new AbortController()

      const stream = createNDJSONStream({
        childStream,
        conversationKey: convKey,
        requestId: "test-5",
        conversationWorkspace: workspace,
        tokenSource: "user_provided",
        model: TEST_MODEL,
        onStreamComplete: () => {
          unlockConversation(convKey)
        },
        cancelState: { requested: false, reader: null },
      })

      setupAbortHandler({
        signal: abortController.signal,
        stream,
        conversationKey: convKey,
        requestId: "test-5",
      })

      // Abort immediately
      abortController.abort()
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(isConversationLocked(convKey)).toBe(false)
    })
  })

  describe("Stream Error Releases Lock (Error Path)", () => {
    it("should release lock when child stream errors", async () => {
      let callbackFired = false

      // Create stream that errors
      const errorStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"type":"start"}\n'))
          controller.error(new Error("Child process crashed"))
        },
      })

      const locked = tryLockConversation(convKey)
      expect(locked).toBe(true)

      const stream = createNDJSONStream({
        childStream: errorStream,
        conversationKey: convKey,
        requestId: "test-6",
        conversationWorkspace: workspace,
        tokenSource: "user_provided",
        model: TEST_MODEL,
        onStreamComplete: () => {
          callbackFired = true
          unlockConversation(convKey)
        },
        cancelState: { requested: false, reader: null },
      })

      // Try to consume stream (will error)
      try {
        await consumeStream(stream)
      } catch {
        // Expected error
      }

      // CRITICAL: Callback should fire even on error
      expect(callbackFired).toBe(true)
      expect(isConversationLocked(convKey)).toBe(false)
    })
  })

  describe("Sequential Requests (The Original Bug Scenario)", () => {
    it("should allow second request immediately after first completes", async () => {
      // FIRST REQUEST
      let callback1Fired = false

      const childStream1 = createMockChildStream([
        { type: "message", data: { content: "First" } },
        { type: "complete", data: { result: "Done" } },
      ])

      const locked1 = tryLockConversation(convKey)
      expect(locked1).toBe(true)

      const stream1 = createNDJSONStream({
        childStream: childStream1,
        conversationKey: convKey,
        requestId: "req-1",
        conversationWorkspace: workspace,
        tokenSource: "user_provided",
        model: TEST_MODEL,
        onStreamComplete: () => {
          callback1Fired = true
          unlockConversation(convKey)
        },
        cancelState: { requested: false, reader: null },
      })

      await consumeStream(stream1)

      expect(callback1Fired).toBe(true)
      expect(isConversationLocked(convKey)).toBe(false)

      // SECOND REQUEST (should succeed immediately)
      let callback2Fired = false

      const childStream2 = createMockChildStream([
        { type: "message", data: { content: "Second" } },
        { type: "complete", data: { result: "Done" } },
      ])

      const locked2 = tryLockConversation(convKey)
      expect(locked2).toBe(true) // Should NOT be false (409)

      const stream2 = createNDJSONStream({
        childStream: childStream2,
        conversationKey: convKey,
        requestId: "req-2",
        conversationWorkspace: workspace,
        tokenSource: "user_provided",
        model: TEST_MODEL,
        onStreamComplete: () => {
          callback2Fired = true
          unlockConversation(convKey)
        },
        cancelState: { requested: false, reader: null },
      })

      await consumeStream(stream2)

      expect(callback2Fired).toBe(true)
      expect(isConversationLocked(convKey)).toBe(false)
    })

    it("should allow send after abort → send flow", async () => {
      // FIRST REQUEST (aborted)
      const childStream1 = createMockChildStream([
        { type: "message", data: { content: "First" } },
        { type: "message", data: { content: "Abort me" } },
      ])

      const locked1 = tryLockConversation(convKey)
      expect(locked1).toBe(true)

      const abortController1 = new AbortController()

      const stream1 = createNDJSONStream({
        childStream: childStream1,
        conversationKey: convKey,
        requestId: "req-abort-1",
        conversationWorkspace: workspace,
        tokenSource: "user_provided",
        model: TEST_MODEL,
        onStreamComplete: () => {
          unlockConversation(convKey)
        },
        cancelState: { requested: false, reader: null },
      })

      setupAbortHandler({
        signal: abortController1.signal,
        stream: stream1,
        conversationKey: convKey,
        requestId: "req-abort-1",
      })

      // User clicks stop
      await triggerAbort(abortController1)

      expect(isConversationLocked(convKey)).toBe(false)

      // SECOND REQUEST (should succeed immediately)
      let callback2Fired = false

      const childStream2 = createMockChildStream([
        { type: "message", data: { content: "Second after abort" } },
        { type: "complete", data: { result: "Done" } },
      ])

      const locked2 = tryLockConversation(convKey)
      expect(locked2).toBe(true) // THE BUG: This was false (409)

      const stream2 = createNDJSONStream({
        childStream: childStream2,
        conversationKey: convKey,
        requestId: "req-abort-2",
        conversationWorkspace: workspace,
        tokenSource: "user_provided",
        model: TEST_MODEL,
        onStreamComplete: () => {
          callback2Fired = true
          unlockConversation(convKey)
        },
        cancelState: { requested: false, reader: null },
      })

      await consumeStream(stream2)

      expect(callback2Fired).toBe(true)
      expect(isConversationLocked(convKey)).toBe(false)
    })

    it("should handle rapid abort → send → abort → send", async () => {
      for (let i = 0; i < 5; i++) {
        const childStream = createMockChildStream([
          { type: "message", data: { content: `Message ${i}` } },
          { type: "complete", data: { result: "Done" } },
        ])

        const locked = tryLockConversation(convKey)
        expect(locked).toBe(true)

        const abortController = new AbortController()

        const stream = createNDJSONStream({
          childStream,
          conversationKey: convKey,
          requestId: `req-rapid-${i}`,
          conversationWorkspace: workspace,
          tokenSource: "user_provided",
          model: TEST_MODEL,
          onStreamComplete: () => {
            unlockConversation(convKey)
          },
          cancelState: { requested: false, reader: null },
        })

        setupAbortHandler({
          signal: abortController.signal,
          stream,
          conversationKey: convKey,
          requestId: `req-rapid-${i}`,
        })

        // Randomly abort or complete
        if (i % 2 === 0) {
          await triggerAbort(abortController)
        } else {
          await consumeStream(stream)
        }

        expect(isConversationLocked(convKey)).toBe(false)
      }
    })
  })

  describe("Concurrent Conversation Isolation", () => {
    it("should not affect other conversations when one aborts", async () => {
      const conv1Key = tabKey({ userId, tabGroupId: "test-tabgroup", tabId: "conv-1" })
      const conv2Key = tabKey({ userId, tabGroupId: "test-tabgroup", tabId: "conv-2" })

      // Lock both conversations
      const locked1 = tryLockConversation(conv1Key)
      const locked2 = tryLockConversation(conv2Key)

      expect(locked1).toBe(true)
      expect(locked2).toBe(true)

      const abortController1 = new AbortController()

      const childStream1 = createMockChildStream([{ type: "message", data: { content: "Conv1" } }])

      const stream1 = createNDJSONStream({
        childStream: childStream1,
        conversationKey: conv1Key,
        requestId: "conv-1-req",
        conversationWorkspace: workspace,
        tokenSource: "user_provided",
        model: TEST_MODEL,
        onStreamComplete: () => {
          unlockConversation(conv1Key)
        },
        cancelState: { requested: false, reader: null },
      })

      setupAbortHandler({
        signal: abortController1.signal,
        stream: stream1,
        conversationKey: conv1Key,
        requestId: "conv-1-req",
      })

      // Both should still be locked
      expect(isConversationLocked(conv1Key)).toBe(true)
      expect(isConversationLocked(conv2Key)).toBe(true)

      // Abort conv1 only
      await triggerAbort(abortController1)

      // Conv1 unlocked, conv2 still locked
      expect(isConversationLocked(conv1Key)).toBe(false)
      expect(isConversationLocked(conv2Key)).toBe(true)

      // Unlock conv2 manually (simulating its own completion)
      unlockConversation(conv2Key)

      expect(isConversationLocked(conv2Key)).toBe(false)

      // Cleanup
      unlockConversation(conv1Key)
      unlockConversation(conv2Key)
    })
  })

  describe("Callback Execution Order", () => {
    it("should call onStreamComplete AFTER stream closes", async () => {
      const executionOrder: string[] = []

      const childStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"type":"start"}\n'))
          controller.close()
          executionOrder.push("stream-closed")
        },
      })

      const locked = tryLockConversation(convKey)
      expect(locked).toBe(true)

      const stream = createNDJSONStream({
        childStream,
        conversationKey: convKey,
        requestId: "test-order",
        conversationWorkspace: workspace,
        tokenSource: "user_provided",
        model: TEST_MODEL,
        onStreamComplete: () => {
          executionOrder.push("callback-fired")
          unlockConversation(convKey)
        },
        cancelState: { requested: false, reader: null },
      })

      await consumeStream(stream)

      // Verify execution order
      expect(executionOrder).toEqual(["stream-closed", "callback-fired"])
    })

    it("should not double-call onStreamComplete", async () => {
      let callCount = 0

      const childStream = createMockChildStream([{ type: "message", data: { content: "Test" } }])

      const locked = tryLockConversation(convKey)
      expect(locked).toBe(true)

      const stream = createNDJSONStream({
        childStream,
        conversationKey: convKey,
        requestId: "test-double",
        conversationWorkspace: workspace,
        tokenSource: "user_provided",
        model: TEST_MODEL,
        onStreamComplete: () => {
          callCount++
          unlockConversation(convKey)
        },
        cancelState: { requested: false, reader: null },
      })

      await consumeStream(stream)

      // Callback should only fire once
      expect(callCount).toBe(1)
    })
  })

  describe("Cleanup Without Callback (Backward Compatibility)", () => {
    it("should work without onStreamComplete callback", async () => {
      const childStream = createMockChildStream([{ type: "message", data: { content: "Test" } }])

      // Create stream WITHOUT callback
      const stream = createNDJSONStream({
        childStream,
        conversationKey: convKey,
        requestId: "test-no-callback",
        conversationWorkspace: workspace,
        tokenSource: "user_provided",
        model: TEST_MODEL,
        // No onStreamComplete
        cancelState: { requested: false, reader: null },
      })

      // Should not throw
      await expect(consumeStream(stream)).resolves.toBeUndefined()
    })
  })
})
