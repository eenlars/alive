// @vitest-environment happy-dom
import "fake-indexeddb/auto"
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { useDexieMessageStore } from "../dexieMessageStore"
import { getMessageDb, resetMessageDb, type DbMessage } from "../messageDb"
import {
  useActiveStreamId,
  useIsTabStreaming,
  useStreamingText,
  useTabMessages,
  type TabMessage,
} from "../useTabMessages"

const TEST_USER_ID = "test-user-tab-messages"
const TEST_TAB_ID = "tab-123"

function makeMessage(overrides: Partial<DbMessage>): DbMessage {
  const now = Date.now()
  return {
    id: overrides.id ?? crypto.randomUUID(),
    tabId: overrides.tabId ?? TEST_TAB_ID,
    type: overrides.type ?? "assistant",
    content: overrides.content ?? { kind: "text", text: "hello" },
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    version: overrides.version ?? 1,
    status: overrides.status ?? "complete",
    origin: overrides.origin ?? "local",
    seq: overrides.seq ?? 1,
    ...overrides,
  }
}

async function insertMessages(messages: DbMessage[]): Promise<void> {
  const db = getMessageDb(TEST_USER_ID)
  await db.messages.bulkAdd(messages)
}

function resetDexieStore(): void {
  useDexieMessageStore.setState({
    session: null,
    currentTabGroupId: null,
    currentTabId: null,
    currentWorkspace: null,
    isLoading: false,
    isSyncing: false,
    activeStreamByTab: {},
    streamingBuffers: {},
    resumeSessionAtByTab: {},
  })
}

describe("useTabMessages", () => {
  const originalConsoleError = console.error

  beforeAll(() => {
    console.error = (...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].includes("not wrapped in act")) {
        return
      }
      originalConsoleError(...args)
    }
  })

  afterEach(async () => {
    resetDexieStore()
    const db = getMessageDb(TEST_USER_ID)
    await db.delete()
    resetMessageDb()
    vi.useRealTimers()
  })

  afterAll(() => {
    console.error = originalConsoleError
  })

  it("orders messages by seq, not createdAt", async () => {
    await act(async () => {
      await insertMessages([
        makeMessage({ id: "msg-2", seq: 2, createdAt: 2000 }),
        makeMessage({ id: "msg-1", seq: 1, createdAt: 3000 }),
        makeMessage({ id: "msg-3", seq: 3, createdAt: 1000 }),
      ])
    })

    const { result } = renderHook(() => useTabMessages(TEST_TAB_ID, TEST_USER_ID))

    await waitFor(() => {
      expect(result.current).toHaveLength(3)
    })

    expect((result.current as TabMessage[]).map(m => m.id)).toEqual(["msg-1", "msg-2", "msg-3"])
  })

  it("uses live streaming buffer when available", async () => {
    const streamId = "stream-1"
    await act(async () => {
      await insertMessages([
        makeMessage({
          id: streamId,
          status: "streaming",
          content: { kind: "text", text: "snapshot" },
        }),
      ])
    })

    act(() => {
      useDexieMessageStore.setState({
        streamingBuffers: { [streamId]: "live buffer text" },
      })
    })

    const { result } = renderHook(() => useTabMessages(TEST_TAB_ID, TEST_USER_ID))

    await waitFor(() => {
      expect(result.current).toHaveLength(1)
    })

    expect(result.current[0].content).toBe("live buffer text")
    expect(result.current[0].isStreaming).toBe(true)
    expect(result.current[0].status).toBe("streaming")
  })

  it("marks stale streaming messages as interrupted when no buffer exists", async () => {
    const now = Date.now()
    await act(async () => {
      await insertMessages([
        makeMessage({
          id: "stream-stale",
          status: "streaming",
          updatedAt: now - 120_000, // stale beyond threshold
          content: { kind: "text", text: "stale snapshot" },
        }),
      ])
    })

    const { result } = renderHook(() => useTabMessages(TEST_TAB_ID, TEST_USER_ID))

    await waitFor(() => {
      expect(result.current).toHaveLength(1)
    })

    expect(result.current[0].status).toBe("interrupted")
    expect(result.current[0].isStreaming).toBe(false)
    expect(result.current[0].content).toBe("stale snapshot")
  })

  it("keeps recent streaming messages in streaming state without buffer", async () => {
    const now = Date.now()
    await act(async () => {
      await insertMessages([
        makeMessage({
          id: "stream-recent",
          status: "streaming",
          updatedAt: now - 5_000,
          content: { kind: "text", text: "recent snapshot" },
        }),
      ])
    })

    const { result } = renderHook(() => useTabMessages(TEST_TAB_ID, TEST_USER_ID))

    await waitFor(() => {
      expect(result.current).toHaveLength(1)
    })

    expect(result.current[0].status).toBe("streaming")
    expect(result.current[0].isStreaming).toBe(true)
    expect(result.current[0].content).toBe("recent snapshot")
  })

  it("returns empty array when tabId or userId is null", async () => {
    const { result: noTab } = renderHook(() => useTabMessages(null, TEST_USER_ID))
    expect(noTab.current).toEqual([])

    const { result: noUser } = renderHook(() => useTabMessages(TEST_TAB_ID, null))
    expect(noUser.current).toEqual([])
  })

  it("filters out soft-deleted messages", async () => {
    await act(async () => {
      await insertMessages([
        makeMessage({ id: "alive", seq: 1 }),
        makeMessage({ id: "deleted", seq: 2, deletedAt: Date.now() }),
      ])
    })

    const { result } = renderHook(() => useTabMessages(TEST_TAB_ID, TEST_USER_ID))

    await waitFor(() => {
      expect(result.current).toHaveLength(1)
    })

    expect(result.current[0].id).toBe("alive")
  })

  it("exposes active stream state and streaming text per tab", async () => {
    act(() => {
      useDexieMessageStore.setState({
        activeStreamByTab: { [TEST_TAB_ID]: "stream-active" },
        streamingBuffers: { "stream-active": "live text" },
      })
    })

    const { result: activeStream } = renderHook(() => useActiveStreamId(TEST_TAB_ID))
    expect(activeStream.current).toBe("stream-active")

    const { result: isStreaming } = renderHook(() => useIsTabStreaming(TEST_TAB_ID))
    expect(isStreaming.current).toBe(true)

    const { result: streamText } = renderHook(() => useStreamingText(TEST_TAB_ID))
    expect(streamText.current).toBe("live text")

    const { result: noStreamText } = renderHook(() => useStreamingText("other-tab"))
    expect(noStreamText.current).toBeNull()
  })
})
