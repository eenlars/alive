import { describe, expect, it } from "vitest"
import { describeCron, parseCronExpression } from "../cron-parser"

describe("parseCronExpression", () => {
  it("parses a valid 5-field expression", () => {
    const result = parseCronExpression("*/5 * * * *")
    expect(result).toEqual({
      minute: "*/5",
      hour: "*",
      dayOfMonth: "*",
      month: "*",
      dayOfWeek: "*",
    })
  })

  it("parses daily at 9 AM", () => {
    const result = parseCronExpression("0 9 * * *")
    expect(result).toEqual({
      minute: "0",
      hour: "9",
      dayOfMonth: "*",
      month: "*",
      dayOfWeek: "*",
    })
  })

  it("parses weekday-only schedule", () => {
    const result = parseCronExpression("0 9 * * 1-5")
    expect(result).toEqual({
      minute: "0",
      hour: "9",
      dayOfMonth: "*",
      month: "*",
      dayOfWeek: "1-5",
    })
  })

  it("rejects fewer than 5 fields", () => {
    expect(parseCronExpression("*/5 * *")).toBeNull()
  })

  it("rejects more than 5 fields", () => {
    expect(parseCronExpression("*/5 * * * * *")).toBeNull()
  })

  it("rejects expressions with invalid characters", () => {
    expect(parseCronExpression("abc * * * *")).toBeNull()
    expect(parseCronExpression("0 9 * * MON")).toBeNull()
  })

  it("rejects empty string", () => {
    expect(parseCronExpression("")).toBeNull()
  })

  it("handles extra whitespace", () => {
    const result = parseCronExpression("  0  9  *  *  1-5  ")
    expect(result).toEqual({
      minute: "0",
      hour: "9",
      dayOfMonth: "*",
      month: "*",
      dayOfWeek: "1-5",
    })
  })
})

describe("describeCron", () => {
  it("describes every-5-minutes", () => {
    expect(describeCron("*/5 * * * *")).toBe("Every 5 minutes")
  })

  it("describes every-10-minutes", () => {
    expect(describeCron("*/10 * * * *")).toBe("Every 10 minutes")
  })

  it("describes hourly", () => {
    expect(describeCron("0 * * * *")).toBe("Every hour, at minute 0")
  })

  it("describes daily at specific time", () => {
    expect(describeCron("0 9 * * *")).toBe("at 09:00")
  })

  it("describes weekdays at 9 AM", () => {
    expect(describeCron("0 9 * * 1-5")).toBe("at 09:00 on weekdays")
  })

  it("describes specific weekday", () => {
    const desc = describeCron("0 9 * * 0")
    expect(desc).toBe("at 09:00 on Sunday")
  })

  it("describes monthly on the 1st", () => {
    expect(describeCron("0 9 1 * *")).toBe("at 09:00 on the 1st of the month")
  })

  it("returns 'Invalid cron expression' for garbage", () => {
    expect(describeCron("not a cron")).toBe("Invalid cron expression")
  })

  it("returns fallback for all-wildcards", () => {
    // * * * * * has no meaningful parts to describe
    expect(describeCron("* * * * *")).toBe("Cron: * * * * *")
  })

  it("describes weekend schedule", () => {
    expect(describeCron("0 10 * * 0,6")).toBe("at 10:00 on weekends")
  })

  it("describes specific month", () => {
    expect(describeCron("0 9 15 6 *")).toBe("at 09:00 on day 15 in June")
  })
})
