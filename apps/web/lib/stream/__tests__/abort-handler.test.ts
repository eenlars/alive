import { afterEach, describe, expect, it, vi } from "vitest"
import type { TabSessionKey } from "@/features/auth/types/session"
import { setupAbortHandler } from "../abort-handler"

/**
 * Abort Handler Tests
 *
 * These tests verify:
 * 1. Handler accepts signal and stream
 * 2. Handler doesn't throw on null signal
 * 3. Handler logs appropriately
 * 4. Handler can cancel streams
 */

describe("Abort Handler", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("Configuration", () => {
    it("should accept null signal without throwing", () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })

      expect(() => {
        setupAbortHandler({
          signal: null,
          stream: mockStream,
          conversationKey: "test-conv" as TabSessionKey,
          requestId: "test-req",
        })
      }).not.toThrow()
    })

    it("should accept valid AbortSignal", () => {
      const controller = new AbortController()
      const mockStream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })

      expect(() => {
        setupAbortHandler({
          signal: controller.signal,
          stream: mockStream,
          conversationKey: "test-conv" as TabSessionKey,
          requestId: "test-req-2",
        })
      }).not.toThrow()
    })

    it("should accept all required configuration properties", () => {
      const controller = new AbortController()
      const mockStream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })

      expect(() => {
        setupAbortHandler({
          signal: controller.signal,
          stream: mockStream,
          conversationKey: "user1::workspace::tg::conv-123" as TabSessionKey,
          requestId: "req-abc-123",
        })
      }).not.toThrow()
    })
  })

  describe("Signal Handling", () => {
    it("should listen to abort signal", async () => {
      const controller = new AbortController()
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})

      const mockStream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })

      setupAbortHandler({
        signal: controller.signal,
        stream: mockStream,
        conversationKey: "test-conv" as TabSessionKey,
        requestId: "test-req-abort-1",
      })

      // Trigger abort
      controller.abort()

      // Wait for event handler
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Request aborted"))

      consoleLogSpy.mockRestore()
    })

    it("should log with correct request ID", async () => {
      const controller = new AbortController()
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})
      const requestId = "unique-req-xyz-789"

      const mockStream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })

      setupAbortHandler({
        signal: controller.signal,
        stream: mockStream,
        conversationKey: "test-conv" as TabSessionKey,
        requestId,
      })

      controller.abort()

      await new Promise(resolve => setTimeout(resolve, 10))

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(requestId))

      consoleLogSpy.mockRestore()
    })

    it("should handle multiple abort attempts", async () => {
      const controller = new AbortController()
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})

      const mockStream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })

      setupAbortHandler({
        signal: controller.signal,
        stream: mockStream,
        conversationKey: "test-conv" as TabSessionKey,
        requestId: "test-req-multi",
      })

      // Abort multiple times
      controller.abort()
      controller.abort()
      controller.abort()

      await new Promise(resolve => setTimeout(resolve, 10))

      // Should only be called once due to { once: true }
      const callCount = consoleLogSpy.mock.calls.filter(call => call[0]?.toString().includes("Request aborted")).length

      expect(callCount).toBe(1)

      consoleLogSpy.mockRestore()
    })
  })

  describe("Stream Cancellation", () => {
    it("should cancel stream on abort", async () => {
      const controller = new AbortController()
      const cancelSpy = vi.fn().mockResolvedValue(undefined)

      const mockStream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })
      mockStream.cancel = cancelSpy

      setupAbortHandler({
        signal: controller.signal,
        stream: mockStream,
        conversationKey: "test-conv" as TabSessionKey,
        requestId: "test-req-cancel",
      })

      controller.abort()

      await new Promise(resolve => setTimeout(resolve, 10))

      expect(cancelSpy).toHaveBeenCalled()
    })

    it("should handle stream cancel errors gracefully", async () => {
      const controller = new AbortController()
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      const mockStream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })
      mockStream.cancel = vi.fn().mockRejectedValue(new Error("Cancel failed"))

      setupAbortHandler({
        signal: controller.signal,
        stream: mockStream,
        conversationKey: "test-conv" as TabSessionKey,
        requestId: "test-req-error",
      })

      controller.abort()

      await new Promise(resolve => setTimeout(resolve, 10))

      // Should log error but not throw
      expect(consoleErrorSpy).toHaveBeenCalled()

      consoleErrorSpy.mockRestore()
    })
  })

  describe("Error Resilience", () => {
    it("should handle setup errors without throwing", () => {
      const controller = new AbortController()

      const mockStream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })
      mockStream.cancel = vi.fn().mockRejectedValue(new Error("Stream error"))

      expect(() => {
        setupAbortHandler({
          signal: controller.signal,
          stream: mockStream,
          conversationKey: "test-conv" as TabSessionKey,
          requestId: "test-req-resilience",
        })
      }).not.toThrow()
    })

    it("should handle various error types gracefully", async () => {
      const _controller = new AbortController()
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      const _mockStream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })

      // Test with different error types
      const errors = [new Error("Standard error"), new TypeError("Type error"), new ReferenceError("Reference error")]

      for (const error of errors) {
        const testController = new AbortController()
        const testStream = new ReadableStream({
          start(controller) {
            controller.close()
          },
        })
        testStream.cancel = vi.fn().mockRejectedValue(error)

        setupAbortHandler({
          signal: testController.signal,
          stream: testStream,
          conversationKey: "test-conv" as TabSessionKey,
          requestId: "test-req",
        })

        testController.abort()
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      expect(consoleErrorSpy).toHaveBeenCalled()

      consoleErrorSpy.mockRestore()
    })
  })

  describe("Real-World Scenarios", () => {
    it("should work with HTTP request AbortSignal", () => {
      const controller = new AbortController()

      const mockStream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })

      // This simulates the pattern used in route.ts
      expect(() => {
        setupAbortHandler({
          signal: controller.signal, // From req.signal in route handler
          stream: mockStream,
          conversationKey: "user1::default::tg::conv-abc" as TabSessionKey,
          requestId: "req-123",
        })
      }).not.toThrow()
    })

    it("should handle rapid setup and abort", async () => {
      const controller = new AbortController()
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})

      const mockStream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })

      // Setup
      setupAbortHandler({
        signal: controller.signal,
        stream: mockStream,
        conversationKey: "test-conv" as TabSessionKey,
        requestId: "test-req-rapid",
      })

      // Immediately abort
      controller.abort()

      await new Promise(resolve => setTimeout(resolve, 10))

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Request aborted"))

      consoleLogSpy.mockRestore()
    })
  })

  describe("Conversation Key Handling", () => {
    it("should accept various conversation key formats", () => {
      const keys = [
        "simple-key" as TabSessionKey,
        "user1::workspace::tg::conv-123" as TabSessionKey,
        "complex::key::with::parts" as TabSessionKey,
      ]

      for (const key of keys) {
        const controller = new AbortController()

        const mockStream = new ReadableStream({
          start(controller) {
            controller.close()
          },
        })

        expect(() => {
          setupAbortHandler({
            signal: controller.signal,
            stream: mockStream,
            conversationKey: key,
            requestId: "test-req",
          })
        }).not.toThrow()
      }
    })

    it("should accept various request ID formats", () => {
      const requestIds = ["req-1", "unique-req-abc-123", "request-with-dashes-and-numbers-456"]

      for (const id of requestIds) {
        const controller = new AbortController()

        const mockStream = new ReadableStream({
          start(controller) {
            controller.close()
          },
        })

        expect(() => {
          setupAbortHandler({
            signal: controller.signal,
            stream: mockStream,
            conversationKey: "test-conv" as TabSessionKey,
            requestId: id,
          })
        }).not.toThrow()
      }
    })
  })
})
