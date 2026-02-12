import { describe, expect, it } from "vitest"
import { patchEmailDraftToolResultContent, toPersistedEmailDraftStatus } from "../emailDraftState"

describe("emailDraftState", () => {
  it("patches MCP wrapper payloads for email drafts", () => {
    const original = [
      {
        type: "text",
        text: JSON.stringify({
          to: ["n.peet@historischgoud.nl"],
          subject: "Re: FW: Online versie van het Romeinse bordspel",
          body: "Concept body",
          status: "draft",
        }),
      },
    ]

    const next = patchEmailDraftToolResultContent(original, {
      status: "sent",
      id: "gmail-msg-123",
      threadId: "thread-456",
    }) as Array<{ type: string; text: string }>

    const parsed = JSON.parse(next[0].text) as Record<string, unknown>
    expect(parsed.status).toBe("sent")
    expect(parsed.id).toBe("gmail-msg-123")
    expect(parsed.threadId).toBe("thread-456")
  })

  it("returns original content for non-email payloads", () => {
    const original = [{ type: "text", text: JSON.stringify({ ok: true }) }]
    const next = patchEmailDraftToolResultContent(original, { status: "sent", id: "x" })
    expect(next).toBe(original)
  })

  it("normalizes persisted status values", () => {
    expect(toPersistedEmailDraftStatus("draft")).toBe("draft")
    expect(toPersistedEmailDraftStatus("saved")).toBe("saved")
    expect(toPersistedEmailDraftStatus("sent")).toBe("sent")
    expect(toPersistedEmailDraftStatus("sending")).toBe("draft")
    expect(toPersistedEmailDraftStatus(null)).toBe("draft")
  })
})
