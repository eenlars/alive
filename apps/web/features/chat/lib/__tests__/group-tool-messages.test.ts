import { describe, expect, it } from "vitest"
import { getGroupSummary, getToolNames, groupToolMessages, type RenderItem } from "../group-tool-messages"
import type { UIMessage } from "../message-parser"

/** Build a fake TOOL_RESULT UIMessage with the given tool names */
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

/** Build a fake assistant message */
function makeAssistantMessage(id: string): UIMessage {
  return {
    id,
    type: "sdk_message",
    content: {
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Here is my analysis..." }],
      },
    },
    timestamp: new Date(),
  }
}

/** Build a fake user message */
function makeUserMessage(id: string): UIMessage {
  return {
    id,
    type: "user",
    content: "Hello",
    timestamp: new Date(),
  }
}

describe("getToolNames", () => {
  it("extracts tool names from tool_result messages", () => {
    const msg = makeToolResultMessage("1", ["Read", "Grep"])
    expect(getToolNames(msg)).toEqual(["Read", "Grep"])
  })

  it("returns empty for non-tool-result messages", () => {
    expect(getToolNames(makeAssistantMessage("a"))).toEqual([])
    expect(getToolNames(makeUserMessage("u"))).toEqual([])
  })

  it("skips tool results without tool_name", () => {
    const msg: UIMessage = {
      id: "x",
      type: "sdk_message",
      content: {
        type: "user",
        message: {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "tu_1", content: "ok" },
            { type: "tool_result", tool_use_id: "tu_2", tool_name: "Read", content: "ok" },
          ],
        },
      },
      timestamp: new Date(),
    }
    expect(getToolNames(msg)).toEqual(["Read"])
  })
})

describe("groupToolMessages", () => {
  it("does not group fewer than 3 consecutive exploration tools", () => {
    const messages = [makeToolResultMessage("1", ["Read"]), makeToolResultMessage("2", ["Grep"])]
    const items = groupToolMessages(messages)
    expect(items).toHaveLength(2)
    expect(items.every(i => i.type === "single")).toBe(true)
  })

  it("groups 3+ consecutive exploration tool results", () => {
    const messages = [
      makeToolResultMessage("1", ["Read"]),
      makeToolResultMessage("2", ["Grep"]),
      makeToolResultMessage("3", ["Glob"]),
      makeToolResultMessage("4", ["Read"]),
    ]
    const items = groupToolMessages(messages)
    expect(items).toHaveLength(1)
    expect(items[0].type).toBe("group")
    if (items[0].type === "group") {
      expect(items[0].messages).toHaveLength(4)
    }
  })

  it("breaks groups on non-exploration messages", () => {
    const messages = [
      makeToolResultMessage("1", ["Read"]),
      makeToolResultMessage("2", ["Grep"]),
      makeToolResultMessage("3", ["Glob"]),
      makeAssistantMessage("a"),
      makeToolResultMessage("4", ["Read"]),
      makeToolResultMessage("5", ["Grep"]),
      makeToolResultMessage("6", ["Glob"]),
    ]
    const items = groupToolMessages(messages)
    // First group (3 tools), then assistant (single), then second group (3 tools)
    expect(items).toHaveLength(3)
    expect(items[0].type).toBe("group")
    expect(items[1].type).toBe("single")
    expect(items[2].type).toBe("group")
  })

  it("does not group Write/Edit/Bash tool results", () => {
    const messages = [
      makeToolResultMessage("1", ["Write"]),
      makeToolResultMessage("2", ["Edit"]),
      makeToolResultMessage("3", ["Bash"]),
    ]
    const items = groupToolMessages(messages)
    expect(items).toHaveLength(3)
    expect(items.every(i => i.type === "single")).toBe(true)
  })

  it("breaks group when a non-exploration tool appears in sequence", () => {
    const messages = [
      makeToolResultMessage("1", ["Read"]),
      makeToolResultMessage("2", ["Read"]),
      makeToolResultMessage("3", ["Write"]), // non-exploration
      makeToolResultMessage("4", ["Read"]),
      makeToolResultMessage("5", ["Read"]),
    ]
    const items = groupToolMessages(messages)
    // 2 singles (not enough to group), 1 Write single, 2 singles (not enough)
    expect(items).toHaveLength(5)
    expect(items.every(i => i.type === "single")).toBe(true)
  })

  it("handles empty input", () => {
    expect(groupToolMessages([])).toEqual([])
  })

  it("passes through non-tool messages untouched", () => {
    const messages = [makeUserMessage("u1"), makeAssistantMessage("a1"), makeUserMessage("u2")]
    const items = groupToolMessages(messages)
    expect(items).toHaveLength(3)
    expect(items.every(i => i.type === "single")).toBe(true)
  })

  it("preserves correct indices for canDelete", () => {
    const messages = [
      makeAssistantMessage("a1"),
      makeToolResultMessage("1", ["Read"]),
      makeToolResultMessage("2", ["Grep"]),
      makeToolResultMessage("3", ["Glob"]),
    ]
    const items = groupToolMessages(messages)
    expect(items).toHaveLength(2)
    // Assistant at index 0
    const single = items[0] as Extract<RenderItem, { type: "single" }>
    expect(single.index).toBe(0)
    // Group starts at index 1
    const group = items[1] as Extract<RenderItem, { type: "group" }>
    expect(group.startIndex).toBe(1)
  })
})

describe("getGroupSummary", () => {
  it("counts tool occurrences across grouped messages", () => {
    const messages = [
      makeToolResultMessage("1", ["Read"]),
      makeToolResultMessage("2", ["Grep"]),
      makeToolResultMessage("3", ["Read"]),
      makeToolResultMessage("4", ["Glob"]),
      makeToolResultMessage("5", ["Read"]),
    ]
    const { total, breakdown } = getGroupSummary(messages)
    expect(total).toBe(5)
    expect(breakdown).toEqual({ Read: 3, Grep: 1, Glob: 1 })
  })

  it("handles messages with multiple tool results", () => {
    const messages = [makeToolResultMessage("1", ["Read", "Grep"])]
    const { total, breakdown } = getGroupSummary(messages)
    expect(total).toBe(2)
    expect(breakdown).toEqual({ Read: 1, Grep: 1 })
  })
})
