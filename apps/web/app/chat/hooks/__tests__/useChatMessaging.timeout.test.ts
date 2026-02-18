// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react"
import type React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ChatInputHandle } from "@/features/chat/components/ChatInput/types"
import { useChatMessaging } from "../useChatMessaging"

const mocks = vi.hoisted(() => {
  const streamingActions = {
    startStream: vi.fn(),
    endStream: vi.fn(),
    recordError: vi.fn(),
    recordMessageReceived: vi.fn(),
    resetConsecutiveErrors: vi.fn(),
    incrementConsecutiveErrors: vi.fn(),
    getConsecutiveErrors: vi.fn(() => 0),
    recordStreamSeq: vi.fn(),
    updateToolProgress: vi.fn(),
    recordToolUse: vi.fn(),
    markToolPending: vi.fn(),
    getToolName: vi.fn(() => null),
    getToolInput: vi.fn(() => null),
    markToolComplete: vi.fn(),
  }

  const useDexieMessageStore = Object.assign(() => ({}), {
    getState: vi.fn(() => ({
      resumeSessionAtByTab: {},
      clearResumeSessionAt: vi.fn(),
      session: null,
    })),
  })

  return {
    retryAsync: vi.fn((fn: () => Promise<Response>) => fn()),
    isRetryableNetworkError: vi.fn((_error: unknown) => false),
    addDevEvent: vi.fn((..._args: unknown[]) => undefined),
    sendClientError: vi.fn((..._args: unknown[]) => undefined),
    parseStreamEvent: vi.fn((..._args: unknown[]) => null),
    isValidStreamEvent: vi.fn((_event: unknown) => true),
    isWarningMessage: vi.fn((event: unknown) => {
      if (!event || typeof event !== "object") return false
      const e = event as { type?: string; data?: { messageType?: string } }
      return e.type === "stream_message" && e.data?.messageType === "stream_warning"
    }),
    buildPromptWithAttachmentsEx: vi.fn((message: string, _attachments: unknown[]) => ({
      prompt: message,
      analyzeImageUrls: undefined,
    })),
    getErrorMessage: vi.fn((_code?: unknown, _details?: unknown) => ""),
    getErrorHelp: vi.fn((_code?: unknown, _details?: unknown) => ""),
    setAbortController: vi.fn((..._args: unknown[]) => undefined),
    clearAbortController: vi.fn((..._args: unknown[]) => undefined),
    useActiveTab: vi.fn((_workspace: string | null) => ({ id: "tab-1" })),
    useFeatureFlag: vi.fn((_flag: string) => false),
    useGoal: vi.fn(() => null),
    useBuilding: vi.fn(() => null),
    useTargetUsers: vi.fn(() => null),
    useModel: vi.fn(() => "claude-sonnet"),
    usePlanMode: vi.fn(() => false),
    getPlanModeState: vi.fn(() => ({ planMode: false })),
    isDevelopment: vi.fn(() => false),
    streamingActions,
    useDexieMessageStore,
    handleSessionExpired: vi.fn((..._args: unknown[]) => undefined),
    toastError: vi.fn((..._args: unknown[]) => undefined),
  }
})

vi.mock("@webalive/shared", () => ({
  retryAsync: mocks.retryAsync,
  isRetryableNetworkError: mocks.isRetryableNetworkError,
}))

vi.mock("react-hot-toast", () => ({
  default: {
    error: (...args: unknown[]) => mocks.toastError(...args),
  },
}))

vi.mock("@/features/chat/lib/dev-terminal-context", () => ({
  ClientError: {
    TIMEOUT_ERROR: "timeout_error",
    INVALID_EVENT_STRUCTURE: "invalid_event_structure",
    PARSE_ERROR: "parse_error",
    CRITICAL_PARSE_ERROR: "critical_parse_error",
    READER_ERROR: "reader_error",
    HTTP_ERROR: "http_error",
    GENERAL_ERROR: "general_error",
  },
  ClientRequest: {
    MESSAGE: "client.message",
  },
  useDevTerminal: () => ({
    addEvent: mocks.addDevEvent,
  }),
}))

vi.mock("@/features/chat/lib/message-parser", () => ({
  parseStreamEvent: mocks.parseStreamEvent,
}))

vi.mock("@/features/chat/lib/send-client-error", () => ({
  sendClientError: mocks.sendClientError,
}))

vi.mock("@/features/chat/lib/stream-guards", () => ({
  isValidStreamEvent: mocks.isValidStreamEvent,
}))

vi.mock("@/features/chat/lib/streaming/ndjson", () => ({
  isWarningMessage: mocks.isWarningMessage,
}))

vi.mock("@/features/chat/types/stream", () => ({
  isCompleteEvent: () => false,
  isDoneEvent: () => false,
  isErrorEvent: () => false,
  isInterruptEvent: () => false,
}))

vi.mock("@/features/chat/utils/format-messages", () => ({
  formatMessagesAsText: () => "",
}))

vi.mock("@/features/chat/utils/prompt-builder", () => ({
  buildPromptWithAttachmentsEx: mocks.buildPromptWithAttachmentsEx,
}))

vi.mock("@/lib/db/dexieMessageStore", () => ({
  useDexieMessageStore: mocks.useDexieMessageStore,
}))

vi.mock("@/lib/db/messageAdapters", () => ({
  toUIMessage: (message: unknown) => message,
}))

vi.mock("@/lib/db/messageDb", () => ({
  getMessageDb: () => ({
    messages: {
      where: () => ({
        equals: () => ({
          sortBy: async () => [],
        }),
      }),
    },
  }),
}))

vi.mock("@/lib/error-codes", () => ({
  ErrorCodes: {
    CONVERSATION_BUSY: "CONVERSATION_BUSY",
    NO_SESSION: "NO_SESSION",
    AUTH_REQUIRED: "AUTH_REQUIRED",
  },
  getErrorMessage: mocks.getErrorMessage,
  getErrorHelp: mocks.getErrorHelp,
}))

vi.mock("@/lib/errors", () => ({
  HttpError: class HttpError extends Error {
    status: number
    statusText: string
    errorCode?: string

    constructor(message: string, status: number, statusText: string, errorCode?: string) {
      super(message)
      this.name = "HttpError"
      this.status = status
      this.statusText = statusText
      this.errorCode = errorCode
    }
  },
}))

vi.mock("@/lib/stores/authStore", () => ({
  authStore: {
    handleSessionExpired: mocks.handleSessionExpired,
  },
}))

vi.mock("@/lib/stores/debug-store", () => ({
  isDevelopment: () => mocks.isDevelopment(),
}))

vi.mock("@/lib/stores/featureFlagStore", () => ({
  useFeatureFlag: mocks.useFeatureFlag,
}))

vi.mock("@/lib/stores/goalStore", () => ({
  useGoal: () => mocks.useGoal(),
  useBuilding: () => mocks.useBuilding(),
  useTargetUsers: () => mocks.useTargetUsers(),
}))

vi.mock("@/lib/stores/llmStore", () => ({
  useModel: () => mocks.useModel(),
}))

vi.mock("@/lib/stores/planModeStore", () => ({
  usePlanMode: () => mocks.usePlanMode(),
  getPlanModeState: () => mocks.getPlanModeState(),
}))

vi.mock("@/lib/stores/streamingStore", () => ({
  useStreamingActions: () => mocks.streamingActions,
  setAbortController: mocks.setAbortController,
  clearAbortController: mocks.clearAbortController,
}))

vi.mock("@/lib/stores/tabStore", () => ({
  useActiveTab: mocks.useActiveTab,
}))

type UseChatMessagingOptions = Parameters<typeof useChatMessaging>[0]

function createAbortError(): DOMException {
  return new DOMException("The operation was aborted", "AbortError")
}

function createOptions(overrides?: Partial<UseChatMessagingOptions>) {
  const addMessage = vi.fn().mockResolvedValue(undefined)
  const setMsg = vi.fn()
  const clearAllAttachments = vi.fn()
  const getAttachments = vi.fn(() => [])
  const forceScrollToBottom = vi.fn()
  const setShowCompletionDots = vi.fn()

  const base: UseChatMessagingOptions = {
    workspace: "workspace-1",
    worktree: "worktree-1",
    tabId: "tab-1",
    tabGroupId: "tab-group-1",
    isTerminal: false,
    busy: false,
    msg: "",
    setMsg,
    addMessage,
    chatInputRef: {
      current: {
        getAttachments,
        clearAllAttachments,
      } as unknown as ChatInputHandle,
    } as React.RefObject<ChatInputHandle | null>,
    forceScrollToBottom,
    setShowCompletionDots,
  }

  return { ...base, ...overrides, addMessage, setMsg, forceScrollToBottom }
}

function getCallBody(call: unknown[]): Record<string, unknown> {
  const init = (call[1] ?? {}) as RequestInit
  const body = init.body
  if (typeof body !== "string") return {}
  return JSON.parse(body) as Record<string, unknown>
}

describe("useChatMessaging timeouts", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    mocks.retryAsync.mockImplementation(async (fn: () => Promise<Response>) => fn())
    mocks.isRetryableNetworkError.mockReturnValue(false)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("cancels via tab fallback and shows timeout message when stream does not start in time", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url === "/api/claude/stream") {
        return new Promise<Response>((_, reject) => {
          const signal = init?.signal
          if (!(signal instanceof AbortSignal)) {
            reject(new Error("Expected AbortSignal"))
            return
          }

          signal.addEventListener(
            "abort",
            () => {
              reject(createAbortError())
            },
            { once: true },
          )
        })
      }

      if (url === "/api/claude/stream/cancel") {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)

    const options = createOptions()
    const { result } = renderHook(() => useChatMessaging(options))

    await act(async () => {
      const pending = result.current.sendMessage("hello world")
      await vi.advanceTimersByTimeAsync(120_000)
      await pending
    })

    const cancelCall = fetchMock.mock.calls.find(call => call[0] === "/api/claude/stream/cancel")
    expect(cancelCall).toBeDefined()
    const cancelBody = getCallBody(cancelCall ?? [])
    expect(cancelBody).toMatchObject({
      tabId: "tab-1",
      tabGroupId: "tab-group-1",
      workspace: "workspace-1",
      worktree: "worktree-1",
    })

    expect(options.addMessage).toHaveBeenCalledTimes(2)
    const timeoutMessage = options.addMessage.mock.calls[1]?.[0] as { content?: { result?: string } }
    expect(timeoutMessage.content?.result).toContain("stream did not start in 120s")
  })

  it("cancels by requestId and shows timeout message when first stream event never arrives", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url === "/api/claude/stream") {
        const signal = init?.signal
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            if (signal instanceof AbortSignal) {
              signal.addEventListener(
                "abort",
                () => {
                  controller.error(createAbortError())
                },
                { once: true },
              )
            }
          },
        })

        return new Response(stream, {
          status: 200,
          headers: { "X-Request-Id": "req-123" },
        })
      }

      if (url === "/api/claude/stream/cancel") {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)

    const options = createOptions()
    const { result } = renderHook(() => useChatMessaging(options))

    await act(async () => {
      const pending = result.current.sendMessage("hello world")
      await vi.advanceTimersByTimeAsync(60_000)
      await pending
    })

    const cancelCall = fetchMock.mock.calls.find(call => call[0] === "/api/claude/stream/cancel")
    expect(cancelCall).toBeDefined()
    const cancelBody = getCallBody(cancelCall ?? [])
    expect(cancelBody).toMatchObject({
      requestId: "req-123",
    })

    expect(options.addMessage).toHaveBeenCalledTimes(2)
    const timeoutMessage = options.addMessage.mock.calls[1]?.[0] as { content?: { result?: string } }
    expect(timeoutMessage.content?.result).toContain("no stream event received in 60s")
  })

  it("treats warning events as liveness and does not fire first-event timeout", async () => {
    const warningEvent = {
      type: "stream_message",
      requestId: "req-warning",
      timestamp: new Date().toISOString(),
      data: {
        messageType: "stream_warning",
        content: {
          type: "stream_warning",
          provider: "github",
          message: "Token expiring soon",
        },
      },
    }

    const encoder = new TextEncoder()
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url === "/api/claude/stream") {
        const signal = init?.signal

        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(`${JSON.stringify(warningEvent)}\n`))

            const closeTimer = setTimeout(() => {
              controller.close()
            }, 70_000)

            if (signal instanceof AbortSignal) {
              signal.addEventListener(
                "abort",
                () => {
                  clearTimeout(closeTimer)
                  controller.error(createAbortError())
                },
                { once: true },
              )
            }
          },
        })

        return new Response(stream, { status: 200 })
      }

      if (url === "/api/claude/stream/cancel") {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)

    const options = createOptions()
    const { result } = renderHook(() => useChatMessaging(options))

    await act(async () => {
      const pending = result.current.sendMessage("hello world")
      await vi.advanceTimersByTimeAsync(61_000)
      await vi.advanceTimersByTimeAsync(10_000)
      await pending
    })

    expect(fetchMock.mock.calls.some(call => call[0] === "/api/claude/stream/cancel")).toBe(false)
    expect(options.addMessage).toHaveBeenCalledTimes(1) // user message only, no timeout result
  })
})
