import { describe, expect, it } from "vitest"
import { normalizeDraftDateTimesForApi, toApiDateTime, toDateTimeLocalValue } from "../dateTime"

describe("calendar datetime helpers", () => {
  it("keeps RFC3339 UTC values unchanged", () => {
    const input = "2026-02-18T09:00:00Z"
    expect(toApiDateTime(input)).toBe(input)
  })

  it("keeps offset values unchanged", () => {
    const input = "2026-02-18T09:00:00-05:00"
    expect(toApiDateTime(input)).toBe(input)
  })

  it("converts local datetime values to UTC ISO", () => {
    const converted = toApiDateTime("2026-02-18T09:00:00")
    expect(converted.endsWith("Z")).toBe(true)
    expect(Number.isNaN(new Date(converted).getTime())).toBe(false)
  })

  it("round-trips datetime-local values", () => {
    const local = "2026-02-18T09:00"
    const iso = toApiDateTime(local)
    expect(toDateTimeLocalValue(iso)).toBe(local)
  })

  it("normalizes event draft start/end values", () => {
    const normalized = normalizeDraftDateTimesForApi({
      summary: "Planning",
      start: { dateTime: "2026-02-18T09:00:00" },
      end: { dateTime: "2026-02-18T09:30:00" },
    })

    expect(normalized.start.dateTime.endsWith("Z")).toBe(true)
    expect(normalized.end.dateTime.endsWith("Z")).toBe(true)
  })
})
