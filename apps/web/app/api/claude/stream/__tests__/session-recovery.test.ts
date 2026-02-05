/**
 * Tests for session recovery when worker restarts cause "No conversation found" errors
 *
 * Problem: Workers create ephemeral temp HOME directories. When workers restart,
 * session files are lost, but session IDs remain in the store. This causes
 * "No conversation found with session ID" errors when trying to resume.
 *
 * Solution: Detect this error, clear the stale session, and retry without resume.
 *
 * These tests verify the recovery logic works correctly WITHOUT making real API calls.
 */

import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest"

// Types for our mocks
interface MockQueryOptions {
  requestId: string
  payload: {
    message: string
    resume?: string
    [key: string]: unknown
  }
  onMessage: (msg: unknown) => void
  signal?: AbortSignal
}

interface MockSessionStore {
  get: Mock<() => Promise<string | null>>
  set: Mock<(key: string, value: string) => Promise<void>>
  delete: Mock<(key: string) => Promise<void>>
}

interface MockWorkerPool {
  query: Mock<(opts: unknown) => Promise<{ success: boolean }>>
}

describe("Session Recovery - No conversation found", () => {
  let mockSessionStore: MockSessionStore
  let mockWorkerPool: MockWorkerPool
  let queryCallCount: number
  let lastQueryPayload: MockQueryOptions["payload"] | null

  beforeEach(() => {
    vi.clearAllMocks()
    queryCallCount = 0
    lastQueryPayload = null

    // Mock session store
    mockSessionStore = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    }

    // Mock worker pool
    mockWorkerPool = {
      query: vi.fn(),
    }
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  /**
   * Simulates the session recovery logic from route.ts
   * This is the core logic we're testing, extracted for unit testing
   */
  async function runQueryWithSessionRecovery(
    existingSessionId: string | null,
    sessionKey: string,
  ): Promise<{ success: boolean; retried: boolean; error?: string }> {
    const runQuery = async (resumeId: string | undefined) => {
      queryCallCount++
      lastQueryPayload = {
        message: "test message",
        resume: resumeId,
      }

      // Simulate the worker pool query
      return mockWorkerPool.query({
        requestId: "test-request-id",
        payload: lastQueryPayload,
      })
    }

    try {
      await runQuery(existingSessionId || undefined)
      return { success: true, retried: false }
    } catch (err) {
      // This is the exact logic from route.ts
      // The error may come as "Claude Code process exited with code 1" with the actual
      // "No conversation found" message in stderr, so we check both
      const errorMessage = err instanceof Error ? err.message : String(err)
      const stderrMessage = (err as { stderr?: string })?.stderr || ""
      const combinedMessage = `${errorMessage} ${stderrMessage}`
      const isSessionNotFound =
        combinedMessage.includes("No conversation found") ||
        (combinedMessage.includes("session") && combinedMessage.includes("not found"))

      if (isSessionNotFound && existingSessionId && sessionKey) {
        try {
          // Clear stale session from store
          await mockSessionStore.delete(sessionKey)

          // Retry without resume - start fresh conversation
          await runQuery(undefined)
          return { success: true, retried: true }
        } catch (retryErr) {
          return {
            success: false,
            retried: true,
            error: retryErr instanceof Error ? retryErr.message : String(retryErr),
          }
        }
      }

      return {
        success: false,
        retried: false,
        error: errorMessage,
      }
    }
  }

  describe("when session exists and worker returns 'No conversation found'", () => {
    it("should clear stale session and retry without resume", async () => {
      const existingSessionId = "stale-session-abc123"
      const sessionKey = "user::workspace::tab"

      // First call fails with "No conversation found"
      // Second call (retry) succeeds
      mockWorkerPool.query
        .mockRejectedValueOnce(new Error("No conversation found with session ID stale-session-abc123"))
        .mockResolvedValueOnce({ success: true })

      const result = await runQueryWithSessionRecovery(existingSessionId, sessionKey)

      // Should have retried
      expect(result.success).toBe(true)
      expect(result.retried).toBe(true)

      // Should have called query twice
      expect(queryCallCount).toBe(2)

      // Should have deleted stale session
      expect(mockSessionStore.delete).toHaveBeenCalledWith(sessionKey)
      expect(mockSessionStore.delete).toHaveBeenCalledTimes(1)

      // Second call should NOT have resume
      expect(lastQueryPayload?.resume).toBeUndefined()
    })

    it("should detect various 'session not found' error messages", async () => {
      const sessionKey = "user::workspace::tab"
      // These are the error patterns that SHOULD trigger recovery
      // Based on Claude SDK actual error messages
      const errorVariants = [
        "No conversation found with session ID abc123",
        "No conversation found",
        "session not found", // lowercase matches
      ]

      for (const errorMessage of errorVariants) {
        // Reset state for each iteration
        mockWorkerPool.query.mockReset()
        mockSessionStore.delete.mockReset()
        queryCallCount = 0

        mockWorkerPool.query.mockRejectedValueOnce(new Error(errorMessage)).mockResolvedValueOnce({ success: true })

        const result = await runQueryWithSessionRecovery("old-session", sessionKey)

        expect(result.retried).toBe(true)
        expect(result.success).toBe(true)
        expect(mockSessionStore.delete).toHaveBeenCalledWith(sessionKey)
      }
    })

    it("should detect 'No conversation found' in stderr (actual production pattern)", async () => {
      const existingSessionId = "stale-session-abc123"
      const sessionKey = "user::workspace::tab"

      // This is the ACTUAL error pattern from production:
      // Error message is "Claude Code process exited with code 1"
      // But "No conversation found" is in stderr
      const prodError = Object.assign(new Error("Claude Code process exited with code 1"), {
        stderr: "[worker:claude-stderr] No conversation found with session ID: stale-session-abc123\n",
      })

      mockWorkerPool.query.mockRejectedValueOnce(prodError).mockResolvedValueOnce({ success: true })

      const result = await runQueryWithSessionRecovery(existingSessionId, sessionKey)

      // Should have detected the error in stderr and retried
      expect(result.success).toBe(true)
      expect(result.retried).toBe(true)
      expect(queryCallCount).toBe(2)
      expect(mockSessionStore.delete).toHaveBeenCalledWith(sessionKey)
    })

    it("should propagate error if retry also fails", async () => {
      const existingSessionId = "stale-session-abc123"
      const sessionKey = "user::workspace::tab"

      // Both calls fail
      mockWorkerPool.query
        .mockRejectedValueOnce(new Error("No conversation found"))
        .mockRejectedValueOnce(new Error("API rate limit exceeded"))

      const result = await runQueryWithSessionRecovery(existingSessionId, sessionKey)

      expect(result.success).toBe(false)
      expect(result.retried).toBe(true)
      expect(result.error).toBe("API rate limit exceeded")
      expect(queryCallCount).toBe(2)
    })
  })

  describe("when no existing session", () => {
    it("should not attempt recovery for new conversations", async () => {
      mockWorkerPool.query.mockResolvedValueOnce({ success: true })

      const result = await runQueryWithSessionRecovery(null, "user::workspace::tab")

      expect(result.success).toBe(true)
      expect(result.retried).toBe(false)
      expect(queryCallCount).toBe(1)
      expect(mockSessionStore.delete).not.toHaveBeenCalled()
    })
  })

  describe("when error is NOT session-related", () => {
    it("should not retry for API errors", async () => {
      const existingSessionId = "valid-session"
      const sessionKey = "user::workspace::tab"

      mockWorkerPool.query.mockRejectedValueOnce(new Error("API key invalid"))

      const result = await runQueryWithSessionRecovery(existingSessionId, sessionKey)

      expect(result.success).toBe(false)
      expect(result.retried).toBe(false)
      expect(result.error).toBe("API key invalid")
      expect(queryCallCount).toBe(1)
      expect(mockSessionStore.delete).not.toHaveBeenCalled()
    })

    it("should not retry for rate limit errors", async () => {
      mockWorkerPool.query.mockRejectedValueOnce(new Error("Rate limit exceeded"))

      const result = await runQueryWithSessionRecovery("valid-session", "user::workspace::tab")

      expect(result.success).toBe(false)
      expect(result.retried).toBe(false)
      expect(mockSessionStore.delete).not.toHaveBeenCalled()
    })

    it("should not retry for network errors", async () => {
      mockWorkerPool.query.mockRejectedValueOnce(new Error("ECONNREFUSED"))

      const result = await runQueryWithSessionRecovery("valid-session", "user::workspace::tab")

      expect(result.success).toBe(false)
      expect(result.retried).toBe(false)
      expect(mockSessionStore.delete).not.toHaveBeenCalled()
    })
  })

  describe("edge cases", () => {
    it("should handle missing sessionKey gracefully", async () => {
      mockWorkerPool.query.mockRejectedValueOnce(new Error("No conversation found"))

      // sessionKey is empty string (falsy)
      const result = await runQueryWithSessionRecovery("stale-session", "")

      // Should NOT retry because sessionKey is falsy
      expect(result.success).toBe(false)
      expect(result.retried).toBe(false)
      expect(mockSessionStore.delete).not.toHaveBeenCalled()
    })

    it("should handle non-Error thrown values", async () => {
      mockWorkerPool.query
        .mockRejectedValueOnce("No conversation found") // string, not Error
        .mockResolvedValueOnce({ success: true })

      const result = await runQueryWithSessionRecovery("stale-session", "user::workspace::tab")

      // Should still detect and retry
      expect(result.success).toBe(true)
      expect(result.retried).toBe(true)
    })
  })
})

describe("Session Recovery - resumeSessionAt message not found", () => {
  let mockSessionStore: MockSessionStore
  let mockWorkerPool: MockWorkerPool
  let queryCallCount: number
  let lastQueryPayload: (MockQueryOptions["payload"] & { resumeSessionAt?: string }) | null

  beforeEach(() => {
    vi.clearAllMocks()
    queryCallCount = 0
    lastQueryPayload = null

    mockSessionStore = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    }

    mockWorkerPool = {
      query: vi.fn(),
    }
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  /**
   * Simulates the session recovery logic including resumeSessionAt handling
   * This tests the fix for: "No message found with message.uuid of: xxx"
   */
  async function runQueryWithMessageRecovery(
    existingSessionId: string | null,
    sessionKey: string,
    resumeSessionAt: string | undefined,
  ): Promise<{ success: boolean; retriedWithoutMessage: boolean; retriedWithoutSession: boolean; error?: string }> {
    let _retriedWithoutMessage = false
    let _retriedWithoutSession = false

    const runQuery = async (resumeId: string | undefined, resumeAtMessage: string | undefined) => {
      queryCallCount++
      lastQueryPayload = {
        message: "test message",
        resume: resumeId,
        resumeSessionAt: resumeAtMessage,
      }

      return mockWorkerPool.query({
        requestId: "test-request-id",
        payload: lastQueryPayload,
      })
    }

    try {
      await runQuery(existingSessionId || undefined, resumeSessionAt)
      return { success: true, retriedWithoutMessage: false, retriedWithoutSession: false }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      const stderrMessage = (err as { stderr?: string })?.stderr || ""
      const combinedMessage = `${errorMessage} ${stderrMessage}`

      // NEW: Check for message not found error (resumeSessionAt points to non-existent message)
      const isMessageNotFound = combinedMessage.includes("No message found with message.uuid of")

      if (isMessageNotFound && resumeSessionAt && existingSessionId && sessionKey) {
        _retriedWithoutMessage = true
        try {
          // Retry with session but WITHOUT resumeSessionAt - start from session beginning
          await runQuery(existingSessionId, undefined)
          return { success: true, retriedWithoutMessage: true, retriedWithoutSession: false }
        } catch (retryErr) {
          // If that also fails, check if it's a session not found error
          const retryErrorMessage = retryErr instanceof Error ? retryErr.message : String(retryErr)
          const retryStderrMessage = (retryErr as { stderr?: string })?.stderr || ""
          const retryCombined = `${retryErrorMessage} ${retryStderrMessage}`
          const isSessionNotFound =
            retryCombined.includes("No conversation found") ||
            (retryCombined.includes("session") && retryCombined.includes("not found"))

          if (isSessionNotFound) {
            _retriedWithoutSession = true
            try {
              await mockSessionStore.delete(sessionKey)
              await runQuery(undefined, undefined)
              return { success: true, retriedWithoutMessage: true, retriedWithoutSession: true }
            } catch (finalErr) {
              return {
                success: false,
                retriedWithoutMessage: true,
                retriedWithoutSession: true,
                error: finalErr instanceof Error ? finalErr.message : String(finalErr),
              }
            }
          }

          return {
            success: false,
            retriedWithoutMessage: true,
            retriedWithoutSession: false,
            error: retryErrorMessage,
          }
        }
      }

      // Existing session not found handling
      const isSessionNotFound =
        combinedMessage.includes("No conversation found") ||
        (combinedMessage.includes("session") && combinedMessage.includes("not found"))

      if (isSessionNotFound && existingSessionId && sessionKey) {
        _retriedWithoutSession = true
        try {
          await mockSessionStore.delete(sessionKey)
          await runQuery(undefined, undefined)
          return { success: true, retriedWithoutMessage: false, retriedWithoutSession: true }
        } catch (retryErr) {
          return {
            success: false,
            retriedWithoutMessage: false,
            retriedWithoutSession: true,
            error: retryErr instanceof Error ? retryErr.message : String(retryErr),
          }
        }
      }

      return {
        success: false,
        retriedWithoutMessage: false,
        retriedWithoutSession: false,
        error: errorMessage,
      }
    }
  }

  describe("when resumeSessionAt points to non-existent message", () => {
    it("should retry without resumeSessionAt when message not found", async () => {
      const existingSessionId = "valid-session-abc123"
      const sessionKey = "user::workspace::tab"
      const staleMessageId = "c95d4d13-38ac-4d77-b5e9-bcf5cf6d0794"

      // First call fails with "No message found"
      // Second call (retry without resumeSessionAt) succeeds
      const prodError = Object.assign(new Error("Claude Code process exited with code 1"), {
        stderr: `No message found with message.uuid of: ${staleMessageId}\n`,
      })

      mockWorkerPool.query.mockRejectedValueOnce(prodError).mockResolvedValueOnce({ success: true })

      const result = await runQueryWithMessageRecovery(existingSessionId, sessionKey, staleMessageId)

      expect(result.success).toBe(true)
      expect(result.retriedWithoutMessage).toBe(true)
      expect(result.retriedWithoutSession).toBe(false)
      expect(queryCallCount).toBe(2)

      // Session should NOT be deleted - only the resumeSessionAt is cleared
      expect(mockSessionStore.delete).not.toHaveBeenCalled()

      // Second call should have session but NO resumeSessionAt
      expect(lastQueryPayload?.resume).toBe(existingSessionId)
      expect(lastQueryPayload?.resumeSessionAt).toBeUndefined()
    })

    it("should detect the exact production error pattern", async () => {
      const existingSessionId = "608b5f2a-14c6-4fa2-9975-f0b5285ad58e"
      const sessionKey = "user::workspace::tab"
      const staleMessageId = "c95d4d13-38ac-4d77-b5e9-bcf5cf6d0794"

      // This is the EXACT error from the production logs
      const prodError = Object.assign(new Error("Claude Code process exited with code 1"), {
        stderr:
          "Spawning Claude Code process: node /root/alive/node_modules/@anthropic-ai/claude-agent-sdk/cli.js ...\n" +
          `No message found with message.uuid of: ${staleMessageId}\n`,
      })

      mockWorkerPool.query.mockRejectedValueOnce(prodError).mockResolvedValueOnce({ success: true })

      const result = await runQueryWithMessageRecovery(existingSessionId, sessionKey, staleMessageId)

      expect(result.success).toBe(true)
      expect(result.retriedWithoutMessage).toBe(true)
    })

    it("should fall back to full session recovery if retry without message also fails with session not found", async () => {
      const existingSessionId = "stale-session-abc123"
      const sessionKey = "user::workspace::tab"
      const staleMessageId = "stale-message-id"

      // First call: message not found
      // Second call: session not found (both session and message are stale)
      // Third call: success with fresh session
      const messageNotFoundError = Object.assign(new Error("Claude Code process exited with code 1"), {
        stderr: `No message found with message.uuid of: ${staleMessageId}\n`,
      })
      const sessionNotFoundError = new Error("No conversation found with session ID stale-session-abc123")

      mockWorkerPool.query
        .mockRejectedValueOnce(messageNotFoundError)
        .mockRejectedValueOnce(sessionNotFoundError)
        .mockResolvedValueOnce({ success: true })

      const result = await runQueryWithMessageRecovery(existingSessionId, sessionKey, staleMessageId)

      expect(result.success).toBe(true)
      expect(result.retriedWithoutMessage).toBe(true)
      expect(result.retriedWithoutSession).toBe(true)
      expect(queryCallCount).toBe(3)

      // Session should be deleted in the final fallback
      expect(mockSessionStore.delete).toHaveBeenCalledWith(sessionKey)

      // Final call should have NO session and NO resumeSessionAt
      expect(lastQueryPayload?.resume).toBeUndefined()
      expect(lastQueryPayload?.resumeSessionAt).toBeUndefined()
    })

    it("should NOT retry if resumeSessionAt is not provided", async () => {
      const existingSessionId = "valid-session"
      const sessionKey = "user::workspace::tab"

      // This error should NOT trigger message recovery because there's no resumeSessionAt
      const prodError = Object.assign(new Error("Claude Code process exited with code 1"), {
        stderr: "No message found with message.uuid of: some-uuid\n",
      })

      mockWorkerPool.query.mockRejectedValueOnce(prodError)

      const result = await runQueryWithMessageRecovery(existingSessionId, sessionKey, undefined)

      // Should fail without retry since there's no resumeSessionAt to clear
      expect(result.success).toBe(false)
      expect(result.retriedWithoutMessage).toBe(false)
      expect(queryCallCount).toBe(1)
    })
  })
})

describe("Session Recovery - Error Detection Patterns", () => {
  /**
   * Test the exact error detection logic used in route.ts
   * Now checks both message and stderr combined
   */
  function isSessionNotFoundError(errorMessage: string, stderr = ""): boolean {
    const combinedMessage = `${errorMessage} ${stderr}`
    return (
      combinedMessage.includes("No conversation found") ||
      (combinedMessage.includes("session") && combinedMessage.includes("not found"))
    )
  }

  it("should match Claude SDK session errors", () => {
    // These are the actual error messages from Claude SDK
    expect(isSessionNotFoundError("No conversation found with session ID abc123")).toBe(true)
    expect(isSessionNotFoundError("No conversation found")).toBe(true)
  })

  it("should match session errors in stderr (production pattern)", () => {
    // The actual production error - message says "exited with code 1", stderr has the real error
    expect(
      isSessionNotFoundError(
        "Claude Code process exited with code 1",
        "[worker:claude-stderr] No conversation found with session ID: abc123\n",
      ),
    ).toBe(true)
  })

  it("should match lowercase session errors", () => {
    // Only lowercase "session" matches due to case-sensitive check
    expect(isSessionNotFoundError("session not found")).toBe(true)
    expect(isSessionNotFoundError("the session was not found")).toBe(true)
  })

  it("should NOT match uppercase Session (case-sensitive)", () => {
    // The current implementation is case-sensitive for "session"
    // This documents the actual behavior - if we want case-insensitive,
    // we'd need to update the production code
    expect(isSessionNotFoundError("Session not found")).toBe(false)
  })

  it("should NOT match unrelated errors", () => {
    expect(isSessionNotFoundError("API key invalid")).toBe(false)
    expect(isSessionNotFoundError("Rate limit exceeded")).toBe(false)
    expect(isSessionNotFoundError("Network error")).toBe(false)
    expect(isSessionNotFoundError("session expired")).toBe(false) // different error type
    expect(isSessionNotFoundError("conversation timeout")).toBe(false)
  })

  it("should NOT match when stderr is about different errors", () => {
    // Make sure we don't accidentally match on "session" in unrelated stderr
    expect(
      isSessionNotFoundError("Claude Code process exited with code 1", "[worker:claude-stderr] API key expired\n"),
    ).toBe(false)
  })
})

describe("Message Recovery - Error Detection Patterns", () => {
  /**
   * Test the error detection logic for resumeSessionAt message not found
   */
  function isMessageNotFoundError(errorMessage: string, stderr = ""): boolean {
    const combinedMessage = `${errorMessage} ${stderr}`
    return combinedMessage.includes("No message found with message.uuid of")
  }

  it("should match the exact production error pattern", () => {
    // This is the EXACT error from the production logs
    expect(
      isMessageNotFoundError(
        "Claude Code process exited with code 1",
        "No message found with message.uuid of: c95d4d13-38ac-4d77-b5e9-bcf5cf6d0794\n",
      ),
    ).toBe(true)
  })

  it("should match when error is in message (not just stderr)", () => {
    expect(isMessageNotFoundError("No message found with message.uuid of: some-uuid-here")).toBe(true)
  })

  it("should NOT match session not found errors", () => {
    expect(isMessageNotFoundError("No conversation found with session ID abc123")).toBe(false)
    expect(isMessageNotFoundError("session not found")).toBe(false)
  })

  it("should NOT match unrelated errors", () => {
    expect(isMessageNotFoundError("API key invalid")).toBe(false)
    expect(isMessageNotFoundError("Rate limit exceeded")).toBe(false)
    expect(isMessageNotFoundError("message delivery failed")).toBe(false) // different "message"
  })
})
