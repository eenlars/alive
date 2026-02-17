import { describe, expect, it } from "vitest"
import type { UIMessage } from "../message-parser"
import { shouldRenderMessage } from "../message-renderer"

// ---------------------------------------------------------------------------
// Helpers — same pattern as group-tool-messages.test.ts
// UIMessage.content is `unknown`, so we build plain objects matching the
// shapes that shouldRenderMessage casts to internally.
// ---------------------------------------------------------------------------

function makeToolResultMessage(id: string, toolNames: string[]): UIMessage {
  return {
    id,
    type: "sdk_message",
    content: {
      type: "user",
      message: {
        role: "user",
        content: toolNames.map((name, i) => ({
          type: "tool_result" as const,
          tool_use_id: `tu_${id}_${i}`,
          tool_name: name,
          content: `result from ${name}`,
        })),
      },
    },
    timestamp: new Date(),
  }
}

function makeImageToolResultMessage(id: string): UIMessage {
  return {
    id,
    type: "sdk_message",
    content: {
      type: "user",
      message: {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: "iVBOR..." },
          },
        ],
      },
    },
    timestamp: new Date(),
  }
}

function makeAssistantMessage(id: string, textBlocks: string[]): UIMessage {
  return {
    id,
    type: "sdk_message",
    content: {
      type: "assistant",
      message: {
        role: "assistant",
        content: textBlocks.map(text => ({ type: "text" as const, text })),
      },
    },
    timestamp: new Date(),
  }
}

function makeAssistantToolUseMessage(id: string): UIMessage {
  return {
    id,
    type: "sdk_message",
    content: {
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "tool_use" as const, id: `tu_${id}`, name: "Read", input: { file_path: "/foo" } }],
      },
    },
    timestamp: new Date(),
  }
}

function makeAssistantBillingErrorMessage(id: string): UIMessage {
  return {
    id,
    type: "sdk_message",
    content: {
      type: "assistant",
      error: "billing_error",
      message: {
        role: "assistant",
        content: [{ type: "text" as const, text: "Credit balance is too low" }],
      },
    },
    timestamp: new Date(),
  }
}

function makeCompleteMessage(id: string): UIMessage {
  return { id, type: "complete", content: { message: "done" }, timestamp: new Date() }
}

function makeStartMessage(id: string): UIMessage {
  return { id, type: "start", content: {}, timestamp: new Date() }
}

function makeToolProgressMessage(id: string): UIMessage {
  return {
    id,
    type: "tool_progress",
    content: { type: "tool_progress", tool_use_id: "tu_1", tool_name: "Bash", elapsed_time_seconds: 5 },
    timestamp: new Date(),
  }
}

function makeSystemMessage(id: string): UIMessage {
  return {
    id,
    type: "sdk_message",
    content: {
      type: "system",
      subtype: "init",
      session_id: "sess_1",
      uuid: "uuid_1",
    },
    timestamp: new Date(),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("shouldRenderMessage", () => {
  describe("TOOL_RESULT visibility", () => {
    it("returns false when all tool results are hidden (e.g. TodoWrite)", () => {
      // TodoWrite has visibility: "silent" in the policy registry
      const msg = makeToolResultMessage("1", ["TodoWrite"])
      expect(shouldRenderMessage(msg, false)).toBe(false)
    })

    it("returns false when all tool results are from unknown internal tools", () => {
      // Internal mcp__alive-* tools without a policy entry fail closed
      const msg = makeToolResultMessage("1", ["mcp__alive-unknown__some_tool"])
      expect(shouldRenderMessage(msg, false)).toBe(false)
    })

    it("returns true when at least one tool result is visible", () => {
      const msg = makeToolResultMessage("1", ["TodoWrite", "Read"])
      expect(shouldRenderMessage(msg, false)).toBe(true)
    })

    it("returns true when all tool results are visible", () => {
      const msg = makeToolResultMessage("1", ["Read", "Grep", "Bash"])
      expect(shouldRenderMessage(msg, false)).toBe(true)
    })

    it("returns true for image content blocks", () => {
      const msg = makeImageToolResultMessage("1")
      expect(shouldRenderMessage(msg, false)).toBe(true)
    })

    it("returns false for empty content array", () => {
      const msg: UIMessage = {
        id: "empty",
        type: "sdk_message",
        content: {
          type: "user",
          message: { role: "user", content: [] },
        },
        timestamp: new Date(),
      }
      expect(shouldRenderMessage(msg, false)).toBe(false)
    })

    it("returns false for missing content", () => {
      const msg: UIMessage = {
        id: "null",
        type: "sdk_message",
        content: {
          type: "user",
          message: { role: "user", content: undefined },
        },
        timestamp: new Date(),
      }
      expect(shouldRenderMessage(msg, false)).toBe(false)
    })
  })

  describe("ASSISTANT text visibility", () => {
    it("returns false for empty text blocks", () => {
      const msg = makeAssistantMessage("1", [""])
      expect(shouldRenderMessage(msg, false)).toBe(false)
    })

    it("returns false for whitespace-only text blocks", () => {
      const msg = makeAssistantMessage("1", ["   ", "\n\t"])
      expect(shouldRenderMessage(msg, false)).toBe(false)
    })

    it("returns true for non-empty text blocks", () => {
      const msg = makeAssistantMessage("1", ["Here is my analysis..."])
      expect(shouldRenderMessage(msg, false)).toBe(true)
    })

    it("returns true if at least one text block has content", () => {
      const msg = makeAssistantMessage("1", ["", "Hello"])
      expect(shouldRenderMessage(msg, false)).toBe(true)
    })

    it("returns false for tool_use only in non-debug mode", () => {
      const msg = makeAssistantToolUseMessage("1")
      expect(shouldRenderMessage(msg, false)).toBe(false)
    })

    it("returns true for tool_use in debug mode", () => {
      const msg = makeAssistantToolUseMessage("1")
      expect(shouldRenderMessage(msg, true)).toBe(true)
    })

    it("returns true for assistant billing_error messages", () => {
      const msg = makeAssistantBillingErrorMessage("1")
      expect(shouldRenderMessage(msg, false)).toBe(true)
    })
  })

  describe("regression: other message types", () => {
    it("COMPLETE always returns false", () => {
      expect(shouldRenderMessage(makeCompleteMessage("1"), false)).toBe(false)
    })

    it("START always returns false", () => {
      expect(shouldRenderMessage(makeStartMessage("1"), false)).toBe(false)
    })

    it("TOOL_PROGRESS always returns false", () => {
      expect(shouldRenderMessage(makeToolProgressMessage("1"), false)).toBe(false)
    })

    it("SYSTEM returns false in non-debug mode", () => {
      expect(shouldRenderMessage(makeSystemMessage("1"), false)).toBe(false)
    })

    it("SYSTEM returns true in debug mode", () => {
      expect(shouldRenderMessage(makeSystemMessage("1"), true)).toBe(true)
    })
  })
})
