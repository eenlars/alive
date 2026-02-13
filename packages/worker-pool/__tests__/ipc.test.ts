import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { isParentMessage, isWorkerMessage, NdjsonParser } from "../src/ipc"
import type { AgentConfig, AgentRequest, WorkerToParentMessage } from "../src/types"
import { PARENT_MESSAGE_TYPES, STREAM_TYPES, WORKER_MESSAGE_TYPES } from "../src/types"

/** Create minimal valid AgentConfig for tests */
function createTestAgentConfig(): AgentConfig {
  return {
    allowedTools: [],
    disallowedTools: [],
    permissionMode: "default",
    settingSources: [],
    oauthMcpServers: {},
    streamTypes: STREAM_TYPES,
  }
}

/** Create minimal valid AgentRequest for tests */
function createTestPayload(): AgentRequest {
  return {
    message: "test",
    agentConfig: createTestAgentConfig(),
  }
}

describe("NdjsonParser", () => {
  let parser: NdjsonParser
  let messageHandler: ReturnType<typeof vi.fn>
  let errorHandler: ReturnType<typeof vi.fn>

  beforeEach(() => {
    parser = new NdjsonParser()
    messageHandler = vi.fn()
    errorHandler = vi.fn()
    parser.on("message", messageHandler)
    parser.on("error", errorHandler)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("single complete messages", () => {
    it("should parse a complete JSON message with newline", () => {
      const msg: WorkerToParentMessage = { type: WORKER_MESSAGE_TYPES.READY }
      parser.write(`${JSON.stringify(msg)}\n`)

      expect(messageHandler).toHaveBeenCalledTimes(1)
      expect(messageHandler).toHaveBeenCalledWith(msg)
    })

    it("should parse multiple messages in one chunk", () => {
      const msg1: WorkerToParentMessage = { type: WORKER_MESSAGE_TYPES.READY }
      const msg2: WorkerToParentMessage = {
        type: WORKER_MESSAGE_TYPES.COMPLETE,
        requestId: "123",
        result: {},
      }

      parser.write(`${JSON.stringify(msg1)}\n${JSON.stringify(msg2)}\n`)

      expect(messageHandler).toHaveBeenCalledTimes(2)
      expect(messageHandler).toHaveBeenNthCalledWith(1, msg1)
      expect(messageHandler).toHaveBeenNthCalledWith(2, msg2)
    })

    it("should ignore empty lines", () => {
      const msg: WorkerToParentMessage = { type: WORKER_MESSAGE_TYPES.READY }
      parser.write(`\n\n${JSON.stringify(msg)}\n\n`)

      expect(messageHandler).toHaveBeenCalledTimes(1)
      expect(messageHandler).toHaveBeenCalledWith(msg)
    })
  })

  describe("partial messages", () => {
    it("should handle message split across multiple chunks", () => {
      const msg: WorkerToParentMessage = {
        type: WORKER_MESSAGE_TYPES.MESSAGE,
        requestId: "abc",
        content: { data: "test" },
      }
      const json = JSON.stringify(msg)

      // Split in the middle
      const mid = Math.floor(json.length / 2)
      parser.write(json.slice(0, mid))
      expect(messageHandler).not.toHaveBeenCalled()

      parser.write(`${json.slice(mid)}\n`)
      expect(messageHandler).toHaveBeenCalledTimes(1)
      expect(messageHandler).toHaveBeenCalledWith(msg)
    })

    it("should handle newline coming in separate chunk", () => {
      const msg: WorkerToParentMessage = { type: WORKER_MESSAGE_TYPES.READY }
      parser.write(JSON.stringify(msg))
      expect(messageHandler).not.toHaveBeenCalled()

      parser.write("\n")
      expect(messageHandler).toHaveBeenCalledTimes(1)
      expect(messageHandler).toHaveBeenCalledWith(msg)
    })
  })

  describe("error handling", () => {
    it("should emit error for invalid JSON", () => {
      parser.write("not valid json\n")

      expect(messageHandler).not.toHaveBeenCalled()
      expect(errorHandler).toHaveBeenCalledTimes(1)
      expect(errorHandler.mock.calls[0][0]).toBeInstanceOf(Error)
      expect(errorHandler.mock.calls[0][0].message).toContain("Failed to parse NDJSON")
    })

    it("should continue parsing after error", () => {
      const validMsg: WorkerToParentMessage = { type: WORKER_MESSAGE_TYPES.READY }

      parser.write("invalid\n")
      parser.write(`${JSON.stringify(validMsg)}\n`)

      expect(errorHandler).toHaveBeenCalledTimes(1)
      expect(messageHandler).toHaveBeenCalledTimes(1)
      expect(messageHandler).toHaveBeenCalledWith(validMsg)
    })

    it("should emit error and clear buffer when exceeding max size", () => {
      // Create parser with small max buffer for testing
      const smallParser = new NdjsonParser(100)
      smallParser.on("message", messageHandler)
      smallParser.on("error", errorHandler)

      // Write data that exceeds the buffer limit
      smallParser.write("x".repeat(150))

      expect(errorHandler).toHaveBeenCalledTimes(1)
      expect(errorHandler.mock.calls[0][0].message).toContain("Buffer exceeded")
      expect(messageHandler).not.toHaveBeenCalled()

      // Parser should recover and accept new messages
      const validMsg: WorkerToParentMessage = { type: WORKER_MESSAGE_TYPES.READY }
      smallParser.write(`${JSON.stringify(validMsg)}\n`)
      expect(messageHandler).toHaveBeenCalledTimes(1)
    })
  })

  describe("flush", () => {
    it("should parse remaining buffer on flush", () => {
      const msg: WorkerToParentMessage = { type: WORKER_MESSAGE_TYPES.READY }
      parser.write(JSON.stringify(msg))
      expect(messageHandler).not.toHaveBeenCalled()

      parser.flush()
      expect(messageHandler).toHaveBeenCalledTimes(1)
      expect(messageHandler).toHaveBeenCalledWith(msg)
    })

    it("should emit error for invalid JSON on flush", () => {
      parser.write("incomplete")
      parser.flush()

      expect(messageHandler).not.toHaveBeenCalled()
      // Changed behavior: now emits error instead of silently ignoring
      // This helps detect protocol issues rather than hiding them
      expect(errorHandler).toHaveBeenCalledTimes(1)
      expect(errorHandler.mock.calls[0][0].message).toMatch(/Unparseable content/)
    })

    it("should clear buffer after flush", () => {
      const msg: WorkerToParentMessage = { type: WORKER_MESSAGE_TYPES.READY }
      parser.write(JSON.stringify(msg))
      parser.flush()

      // Flush again should not emit duplicate
      parser.flush()
      expect(messageHandler).toHaveBeenCalledTimes(1)
    })
  })
})

describe("isWorkerMessage", () => {
  it("should return true for valid worker messages", () => {
    expect(isWorkerMessage({ type: WORKER_MESSAGE_TYPES.READY })).toBe(true)
    expect(
      isWorkerMessage({
        type: WORKER_MESSAGE_TYPES.SESSION,
        requestId: "123",
        sessionId: "abc",
      }),
    ).toBe(true)
    expect(
      isWorkerMessage({
        type: WORKER_MESSAGE_TYPES.MESSAGE,
        requestId: "123",
        content: {},
      }),
    ).toBe(true)
    expect(
      isWorkerMessage({
        type: WORKER_MESSAGE_TYPES.COMPLETE,
        requestId: "123",
        result: {},
      }),
    ).toBe(true)
    expect(
      isWorkerMessage({
        type: WORKER_MESSAGE_TYPES.ERROR,
        requestId: "123",
        error: "oops",
      }),
    ).toBe(true)
    expect(isWorkerMessage({ type: WORKER_MESSAGE_TYPES.SHUTDOWN_ACK })).toBe(true)
    expect(
      isWorkerMessage({
        type: WORKER_MESSAGE_TYPES.HEALTH_OK,
        uptime: 100,
        queriesProcessed: 5,
      }),
    ).toBe(true)
  })

  it("should return false for invalid messages", () => {
    expect(isWorkerMessage(null)).toBe(false)
    expect(isWorkerMessage(undefined)).toBe(false)
    expect(isWorkerMessage(WORKER_MESSAGE_TYPES.READY)).toBe(false)
    expect(isWorkerMessage({ type: "unknown" })).toBe(false)
    expect(isWorkerMessage({})).toBe(false)
    expect(isWorkerMessage([])).toBe(false)
  })
})

describe("isParentMessage", () => {
  it("should return true for valid parent messages", () => {
    expect(
      isParentMessage({
        type: PARENT_MESSAGE_TYPES.QUERY,
        requestId: "123",
        payload: createTestPayload(),
      }),
    ).toBe(true)
    expect(
      isParentMessage({
        type: PARENT_MESSAGE_TYPES.CANCEL,
        requestId: "123",
      }),
    ).toBe(true)
    expect(
      isParentMessage({
        type: PARENT_MESSAGE_TYPES.SHUTDOWN,
        graceful: true,
      }),
    ).toBe(true)
    expect(isParentMessage({ type: PARENT_MESSAGE_TYPES.HEALTH_CHECK })).toBe(true)
  })

  it("should return false for invalid messages", () => {
    expect(isParentMessage(null)).toBe(false)
    expect(isParentMessage(undefined)).toBe(false)
    expect(isParentMessage(PARENT_MESSAGE_TYPES.QUERY)).toBe(false)
    // Worker message type should not be valid as parent message
    expect(isParentMessage({ type: WORKER_MESSAGE_TYPES.READY })).toBe(false)
    expect(isParentMessage({})).toBe(false)
  })
})
