import { describe, expect, it } from "vitest"
import { parseStreamEvent, type StreamEvent } from "@/features/chat/lib/message-parser"
import { BridgeStreamType } from "@/features/chat/lib/streaming/ndjson"

describe("parseStreamEvent", () => {
  it("maps assistant billing_error to a user-facing result error", () => {
    const event: StreamEvent = {
      type: BridgeStreamType.MESSAGE,
      requestId: "req-billing",
      timestamp: "2026-02-17T12:00:00.000Z",
      data: {
        messageCount: 1,
        messageType: "assistant",
        content: {
          type: "assistant",
          error: "billing_error",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Credit balance is too low" }],
          },
        },
      },
    }

    const parsed = parseStreamEvent(event)
    expect(parsed).not.toBeNull()
    expect(parsed?.type).toBe("sdk_message")
    expect((parsed?.content as { type: string }).type).toBe("result")
    expect((parsed?.content as { is_error: boolean }).is_error).toBe(true)
    expect((parsed?.content as { result: string }).result).toContain("platform credits are not affected")
    expect((parsed?.content as { result: string }).result).not.toContain("Credit balance is too low")
  })
})
