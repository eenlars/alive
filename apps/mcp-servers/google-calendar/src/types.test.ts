import { describe, expect, it } from "vitest"
import { EventDraftSchema } from "./types.js"

const baseDraft = {
  summary: "Planning",
  start: { dateTime: "2026-02-18T09:00:00" },
  end: { dateTime: "2026-02-18T09:30:00" },
}

describe("EventDraftSchema datetime formats", () => {
  it("accepts local datetime strings", () => {
    const parsed = EventDraftSchema.safeParse(baseDraft)
    expect(parsed.success).toBe(true)
  })

  it("accepts UTC Z datetime strings", () => {
    const parsed = EventDraftSchema.safeParse({
      ...baseDraft,
      start: { dateTime: "2026-02-18T09:00:00Z" },
      end: { dateTime: "2026-02-18T09:30:00Z" },
    })
    expect(parsed.success).toBe(true)
  })

  it("accepts offset datetime strings", () => {
    const parsed = EventDraftSchema.safeParse({
      ...baseDraft,
      start: { dateTime: "2026-02-18T09:00:00-05:00" },
      end: { dateTime: "2026-02-18T09:30:00-05:00" },
    })
    expect(parsed.success).toBe(true)
  })

  it("rejects invalid datetime strings", () => {
    const parsed = EventDraftSchema.safeParse({
      ...baseDraft,
      start: { dateTime: "not-a-date" },
    })
    expect(parsed.success).toBe(false)
  })
})
