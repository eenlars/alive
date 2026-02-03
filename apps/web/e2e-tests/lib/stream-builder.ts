/**
 * Type-safe Claude NDJSON stream builder
 *
 * Uses actual StreamEvent types from production code to ensure
 * mocks stay in sync with reality.
 */

import {
  type BridgeCompleteMessage,
  type BridgeErrorMessage,
  type BridgeMessageEvent,
  type BridgeStartMessage,
  BridgeStreamType,
  type StreamMessage,
} from "@/features/chat/lib/streaming/ndjson"

type StreamEvent = StreamMessage

import { type ErrorCode, ErrorCodes } from "@/lib/error-codes"

const FIXED_TIMESTAMP = "2025-01-01T00:00:00.000Z"
const FIXED_REQUEST_ID = "test-req-123"

export class StreamBuilder {
  private events: StreamEvent[] = []
  private msgCount = 0
  private messageIdCounter = 0

  /** Generate unique message ID for test events */
  private nextMessageId(): string {
    this.messageIdCounter++
    return `${FIXED_REQUEST_ID}-test-${this.messageIdCounter}`
  }

  /**
   * Add a 'start' event
   */
  start(cwd = "/test", host = "test"): this {
    const startMsg: BridgeStartMessage = {
      type: BridgeStreamType.START,
      requestId: FIXED_REQUEST_ID,
      messageId: this.nextMessageId(),
      timestamp: FIXED_TIMESTAMP,
      data: {
        host,
        cwd,
        message: "Starting Claude query...",
        messageLength: 100,
        isResume: false,
      },
    }
    this.events.push(startMsg)
    return this
  }

  /**
   * Add an assistant text message
   */
  text(content: string): this {
    this.msgCount++
    const textMsg: BridgeMessageEvent = {
      type: BridgeStreamType.MESSAGE,
      requestId: FIXED_REQUEST_ID,
      messageId: this.nextMessageId(),
      timestamp: FIXED_TIMESTAMP,
      data: {
        messageCount: this.msgCount,
        messageType: "assistant",
        content: {
          uuid: `uuid-${this.msgCount}`,
          session_id: "test-session",
          type: "assistant",
          message: {
            role: "assistant",
            content: [{ type: "text", text: content }],
            stop_reason: "end_turn",
          },
          parent_tool_use_id: null,
        },
      },
    }
    this.events.push(textMsg)
    return this
  }

  /**
   * Add a thinking block
   */
  thinking(content: string): this {
    this.msgCount++
    const thinkingMsg: BridgeMessageEvent = {
      type: BridgeStreamType.MESSAGE,
      requestId: FIXED_REQUEST_ID,
      messageId: this.nextMessageId(),
      timestamp: FIXED_TIMESTAMP,
      data: {
        messageCount: this.msgCount,
        messageType: "assistant",
        content: {
          uuid: `uuid-${this.msgCount}`,
          session_id: "test-session",
          type: "assistant",
          message: {
            role: "assistant",
            content: [{ type: "thinking", thinking: content }],
            stop_reason: "end_turn",
          },
          parent_tool_use_id: null,
        },
      },
    }
    this.events.push(thinkingMsg)
    return this
  }

  /**
   * Add a tool use + tool result pair
   */
  tool(name: string, input: Record<string, unknown>, result: string, isError = false): this {
    this.msgCount++
    const toolId = `tool-${this.msgCount}`

    const toolUseMsg: BridgeMessageEvent = {
      type: BridgeStreamType.MESSAGE,
      requestId: FIXED_REQUEST_ID,
      messageId: this.nextMessageId(),
      timestamp: FIXED_TIMESTAMP,
      data: {
        messageCount: this.msgCount,
        messageType: "assistant",
        content: {
          uuid: `uuid-${this.msgCount}`,
          session_id: "test-session",
          type: "assistant",
          message: {
            role: "assistant",
            content: [{ type: "tool_use", id: toolId, name, input }],
            stop_reason: "tool_use",
          },
          parent_tool_use_id: null,
        },
      },
    }
    this.events.push(toolUseMsg)

    this.msgCount++
    const toolResultMsg: BridgeMessageEvent = {
      type: BridgeStreamType.MESSAGE,
      requestId: FIXED_REQUEST_ID,
      messageId: this.nextMessageId(),
      timestamp: FIXED_TIMESTAMP,
      data: {
        messageCount: this.msgCount,
        messageType: "user",
        content: {
          uuid: `uuid-${this.msgCount}`,
          session_id: "test-session",
          type: "user",
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: toolId,
                content: result,
                is_error: isError,
              },
            ],
          },
        },
      },
    }
    this.events.push(toolResultMsg)

    return this
  }

  /**
   * Add a complete event
   */
  complete(
    data?: Partial<{
      totalMessages: number
      totalTurns: number
      maxTurns: number
    }>,
  ): this {
    const completeMsg: BridgeCompleteMessage = {
      type: BridgeStreamType.COMPLETE,
      requestId: FIXED_REQUEST_ID,
      messageId: this.nextMessageId(),
      timestamp: FIXED_TIMESTAMP,
      data: {
        totalMessages: this.msgCount,
        totalTurns: 1,
        maxTurns: 25,
        result: null,
        message: "Claude query completed successfully (1/25 turns used)",
        ...data,
      },
    }
    this.events.push(completeMsg)
    return this
  }

  /**
   * Add an error event
   */
  error(message: string, code: ErrorCode = ErrorCodes.QUERY_FAILED): this {
    const errorMsg: BridgeErrorMessage = {
      type: BridgeStreamType.ERROR,
      requestId: FIXED_REQUEST_ID,
      messageId: this.nextMessageId(),
      timestamp: FIXED_TIMESTAMP,
      data: {
        error: code,
        code,
        message,
        details: message,
      },
    }
    this.events.push(errorMsg)
    return this
  }

  /**
   * Convert to NDJSON format (one JSON object per line)
   */
  toNDJSON(): string {
    const lines = this.events.map(e => JSON.stringify(e))
    const doneMessage: StreamEvent = {
      type: BridgeStreamType.DONE,
      requestId: FIXED_REQUEST_ID,
      messageId: this.nextMessageId(),
      timestamp: FIXED_TIMESTAMP,
      data: {},
    }
    lines.push(JSON.stringify(doneMessage))
    return lines.join("\n")
  }
}
