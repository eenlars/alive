// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest"
import { useStreamCancellation } from "../useStreamCancellation"

type UseStreamCancellationOptions = Parameters<typeof useStreamCancellation>[0]

/** Mock options type with vi.fn() for callbacks */
type MockOptions = Omit<UseStreamCancellationOptions, "addMessage" | "setShowCompletionDots"> & {
  addMessage: Mock
  setShowCompletionDots: Mock
}

// Mock dependencies
vi.mock("@/lib/api/api-client", () => ({
  postty: vi.fn().mockResolvedValue({}),
}))

vi.mock("@/lib/api/schemas", () => ({
  validateRequest: vi.fn((_endpoint: string, data: unknown) => data),
}))

const mockEndStream = vi.fn()
const mockGetAbortController = vi.fn()
const mockClearAbortController = vi.fn()
vi.mock("@/lib/stores/streamingStore", () => ({
  useStreamingActions: () => ({
    endStream: mockEndStream,
  }),
  getAbortController: (...args: unknown[]) => mockGetAbortController(...args),
  clearAbortController: (...args: unknown[]) => mockClearAbortController(...args),
}))

// TODO: Fix react/jsx-dev-runtime resolution issue in vitest 4.x with happy-dom
describe.skip("useStreamCancellation", () => {
  // Default mock options for the hook
  const createMockOptions = (): MockOptions => ({
    tabId: "test-conversation-123",
    tabGroupId: "test-tabgroup",
    workspace: "test-workspace",
    addMessage: vi.fn(),
    setShowCompletionDots: vi.fn(),
    abortControllerRef: { current: new AbortController() },
    currentRequestIdRef: { current: "request-123" },
    isSubmittingByTabRef: { current: new Map([["test-conversation-123", true]]) },
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    // Reset abort controller mock
    mockGetAbortController.mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe("isStopping behavior", () => {
    /**
     * IMPORTANT: The isStopping state prevents double-clicks and stays true
     * until the backend confirms cancellation (or 5-second timeout).
     * This ensures users can't spam the stop button while the backend is cleaning up.
     *
     * This test verifies:
     * 1. isStopping is properly typed as boolean (not a ref object)
     * 2. isStopping becomes true immediately after stopStreaming
     * 3. isStopping resets to false after cancel request completes
     */
    it("should expose isStopping as a boolean that resets after cancel completes", async () => {
      const options = createMockOptions()
      const { result } = renderHook(() => useStreamCancellation(options))

      // Initial state
      expect(typeof result.current.isStopping).toBe("boolean")
      expect(result.current.isStopping).toBe(false)

      // After stopStreaming - should be true (waiting for backend cleanup)
      act(() => {
        result.current.stopStreaming()
      })

      // isStopping is true during the cleanup period
      expect(result.current.isStopping).toBe(true)

      // After cancel request completes (mocked postty resolves immediately)
      await act(async () => {
        await vi.runAllTimersAsync()
      })
      expect(result.current.isStopping).toBe(false)
    })

    it("should guard against sequential calls during cleanup", async () => {
      // IMPORTANT: The guard stays active until backend confirms cancellation.
      // This prevents users from spamming the stop button while backend is cleaning up.
      // Note: addMessage is only called once per stopStreaming (unlike setShowCompletionDots
      // which is called twice - once true at start, once false at finish).
      const options = createMockOptions()
      const { result } = renderHook(() => useStreamCancellation(options))

      // Sequential calls during cleanup period - only FIRST executes
      act(() => {
        result.current.stopStreaming() // Starts cleanup
        result.current.stopStreaming() // Blocked by guard
      })

      // Only first call executes (addMessage called once per stopStreaming)
      expect(options.addMessage).toHaveBeenCalledTimes(1)

      // After cancel completes, guard resets
      await act(async () => {
        await vi.runAllTimersAsync()
      })

      // Now another call would work
      act(() => {
        result.current.stopStreaming()
      })
      expect(options.addMessage).toHaveBeenCalledTimes(2)
    })

    it("should guard against re-entry during execution", () => {
      // This tests the ACTUAL purpose of the guard: preventing re-entry
      // if a callback called during stopStreaming tried to call stopStreaming again
      let reEntryAttempted = false

      const setShowCompletionDots = vi.fn(() => {
        if (!reEntryAttempted) {
          reEntryAttempted = true
          // Try to call stopStreaming from WITHIN stopStreaming
          // This simulates a callback that might trigger another stop
          result.current.stopStreaming()
        }
      })

      const options = { ...createMockOptions(), setShowCompletionDots }
      const { result } = renderHook(() => useStreamCancellation(options))

      act(() => {
        result.current.stopStreaming()
      })

      // Re-entry was attempted
      expect(reEntryAttempted).toBe(true)
      // But it should have been blocked by the guard
      // (setShowCompletionDots only called once means re-entry was blocked)
      expect(setShowCompletionDots).toHaveBeenCalledTimes(1)
    })

    it("should allow subsequent calls after guard resets (after cancel completes)", async () => {
      // Note: addMessage is only called once per stopStreaming (unlike setShowCompletionDots
      // which is called twice - once true at start, once false at finish).
      const options = createMockOptions()
      const { result } = renderHook(() => useStreamCancellation(options))

      // First call
      act(() => {
        result.current.stopStreaming()
      })
      expect(options.addMessage).toHaveBeenCalledTimes(1)

      // Guard is still active during cleanup - second call blocked
      act(() => {
        result.current.stopStreaming()
      })
      expect(options.addMessage).toHaveBeenCalledTimes(1)

      // After cancel completes, guard resets
      await act(async () => {
        await vi.runAllTimersAsync()
      })

      // Now second call in NEW act() - guard has reset, should execute
      act(() => {
        result.current.stopStreaming()
      })
      expect(options.addMessage).toHaveBeenCalledTimes(2)
    })

    /**
     * This test captures isStopping DURING execution via a callback.
     * isStopping stays true until backend confirms cancellation.
     */
    it("should have isStopping=true during execution and reset after cancel completes", async () => {
      const options = createMockOptions()
      const { result } = renderHook(() => useStreamCancellation(options))

      // Before stop
      expect(result.current.isStopping).toBe(false)

      act(() => {
        result.current.stopStreaming()
      })

      // After stop, during cleanup period - should be true
      expect(result.current.isStopping).toBe(true)

      // After cancel completes, should reset
      await act(async () => {
        await vi.runAllTimersAsync()
      })
      expect(result.current.isStopping).toBe(false)
    })
  })

  describe("UI state management", () => {
    it("should call endStream on streaming store when stopping", () => {
      const options = createMockOptions()
      const { result } = renderHook(() => useStreamCancellation(options))

      act(() => {
        result.current.stopStreaming()
      })

      // endStream is called immediately when stopping
      expect(mockEndStream).toHaveBeenCalledWith(options.tabId)
    })

    it("should show completion dots", () => {
      const options = createMockOptions()
      const { result } = renderHook(() => useStreamCancellation(options))

      act(() => {
        result.current.stopStreaming()
      })

      expect(options.setShowCompletionDots).toHaveBeenCalledWith(true)
    })

    it("should reset isSubmittingByTabRef to false after cancel completes", async () => {
      const options = createMockOptions()
      options.isSubmittingByTabRef.current.set("test-conversation-123", true)
      const { result } = renderHook(() => useStreamCancellation(options))

      act(() => {
        result.current.stopStreaming()
      })

      // Still true during cleanup period
      expect(options.isSubmittingByTabRef.current.get("test-conversation-123")).toBe(true)

      // After cancel request completes
      await act(async () => {
        await vi.runAllTimersAsync()
      })

      expect(options.isSubmittingByTabRef.current.get("test-conversation-123")).toBe(false)
    })
  })

  describe("abort handling", () => {
    it("should abort the current request", () => {
      const options = createMockOptions()
      const abortSpy = vi.spyOn(options.abortControllerRef.current!, "abort")
      const { result } = renderHook(() => useStreamCancellation(options))

      act(() => {
        result.current.stopStreaming()
      })

      expect(abortSpy).toHaveBeenCalled()
    })

    it("should clear abortControllerRef", () => {
      const options = createMockOptions()
      const { result } = renderHook(() => useStreamCancellation(options))

      act(() => {
        result.current.stopStreaming()
      })

      expect(options.abortControllerRef.current).toBeNull()
    })

    it("should clear currentRequestIdRef", () => {
      const options = createMockOptions()
      const { result } = renderHook(() => useStreamCancellation(options))

      act(() => {
        result.current.stopStreaming()
      })

      expect(options.currentRequestIdRef.current).toBeNull()
    })

    it("should handle missing abortController gracefully", () => {
      const options = createMockOptions()
      options.abortControllerRef.current = null
      const { result } = renderHook(() => useStreamCancellation(options))

      // Should not throw
      expect(() => {
        act(() => {
          result.current.stopStreaming()
        })
      }).not.toThrow()
    })
  })

  describe("completion message", () => {
    it("should add a completion message to mark thinking group as complete", () => {
      const options = createMockOptions()
      const { result } = renderHook(() => useStreamCancellation(options))

      act(() => {
        result.current.stopStreaming()
      })

      // IMPORTANT: addMessage is called with (message, targetConversationId) for tab isolation
      expect(options.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "complete",
          content: {},
        }),
        options.tabId, // targetTabId for tab isolation
      )
    })

    it("should generate unique message ID based on timestamp", () => {
      const options = createMockOptions()
      const { result } = renderHook(() => useStreamCancellation(options))

      act(() => {
        result.current.stopStreaming()
      })

      const call = options.addMessage.mock.calls[0][0]
      expect(call.id).toBeDefined()
      expect(typeof call.id).toBe("string")
      expect(call.timestamp).toBeInstanceOf(Date)
    })
  })

  describe("cancel API request", () => {
    it("should send cancel request with requestId when available", async () => {
      const { postty } = await import("@/lib/api/api-client")
      const options = createMockOptions()
      options.currentRequestIdRef.current = "request-456"
      const { result } = renderHook(() => useStreamCancellation(options))

      act(() => {
        result.current.stopStreaming()
      })

      expect(postty).toHaveBeenCalledWith("claude/stream/cancel", { requestId: "request-456" })
    })

    it("should fallback to tabId when no requestId", async () => {
      const { postty } = await import("@/lib/api/api-client")
      const options = createMockOptions()
      options.currentRequestIdRef.current = null
      const { result } = renderHook(() => useStreamCancellation(options))

      act(() => {
        result.current.stopStreaming()
      })

      expect(postty).toHaveBeenCalledWith("claude/stream/cancel", {
        tabGroupId: "test-tabgroup",
        tabId: "test-conversation-123",
        workspace: "test-workspace",
      })
    })

    it("should skip cancel request when no requestId AND no workspace", async () => {
      const { postty } = await import("@/lib/api/api-client")
      ;(postty as Mock).mockClear()

      const options = createMockOptions()
      options.currentRequestIdRef.current = null
      options.workspace = null
      const { result } = renderHook(() => useStreamCancellation(options))

      act(() => {
        result.current.stopStreaming()
      })

      // Should not call postty - relies on abort() only
      expect(postty).not.toHaveBeenCalled()
    })

    it("should skip cancel request when tabId is empty string", async () => {
      const { postty } = await import("@/lib/api/api-client")
      ;(postty as Mock).mockClear()

      const options = createMockOptions()
      options.currentRequestIdRef.current = null
      options.tabId = ""
      const { result } = renderHook(() => useStreamCancellation(options))

      act(() => {
        result.current.stopStreaming()
      })

      expect(postty).not.toHaveBeenCalled()
    })

    it("should reset states via fallback timeout if cancel request hangs", async () => {
      const { postty } = await import("@/lib/api/api-client")
      // Make postty hang forever (never resolve)
      ;(postty as Mock).mockImplementation(() => new Promise(() => {}))

      const options = createMockOptions()
      const { result } = renderHook(() => useStreamCancellation(options))

      act(() => {
        result.current.stopStreaming()
      })

      // isStopping should be true while waiting
      expect(result.current.isStopping).toBe(true)
      // endStream is called immediately (not after timeout)
      expect(mockEndStream).toHaveBeenCalledWith(options.tabId)

      // Advance past the 5-second fallback timeout
      await act(async () => {
        vi.advanceTimersByTime(5000)
      })

      // States should be reset via fallback timeout
      expect(result.current.isStopping).toBe(false)
      expect(options.isSubmittingByTabRef.current.get("test-conversation-123")).toBe(false)

      // Reset mock for other tests
      ;(postty as Mock).mockResolvedValue({})
    })
  })

  describe("dev terminal events", () => {
    it("should call onDevEvent with interrupt event when provided", () => {
      const options = {
        ...createMockOptions(),
        onDevEvent: vi.fn(),
      }
      const { result } = renderHook(() => useStreamCancellation(options))

      act(() => {
        result.current.stopStreaming()
      })

      expect(options.onDevEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "client.interrupt",
          data: expect.objectContaining({
            message: "Response interrupted by user",
            source: "client_cancel",
            tabId: "test-conversation-123",
          }),
        }),
      )
    })

    it("should include timestamp in dev event", () => {
      const options = {
        ...createMockOptions(),
        onDevEvent: vi.fn(),
      }
      const { result } = renderHook(() => useStreamCancellation(options))

      act(() => {
        result.current.stopStreaming()
      })

      const eventData = options.onDevEvent.mock.calls[0][0].data
      expect(eventData.timestamp).toBeDefined()
      // Should be ISO format
      expect(() => new Date(eventData.timestamp)).not.toThrow()
    })

    it("should work when onDevEvent is not provided", () => {
      const options = createMockOptions()
      // No onDevEvent
      const { result } = renderHook(() => useStreamCancellation(options))

      expect(() => {
        act(() => {
          result.current.stopStreaming()
        })
      }).not.toThrow()
    })
  })
})
