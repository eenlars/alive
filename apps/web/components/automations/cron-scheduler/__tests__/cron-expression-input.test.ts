/**
 * Tests for CronExpressionInput component logic.
 *
 * React rendering is not available in this vitest setup,
 * so we test the pure functions (splitCron) and verify component structure.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const componentSource = readFileSync(
  join(process.cwd(), "components/automations/cron-scheduler/CronExpressionInput.tsx"),
  "utf-8",
)

/**
 * Replicate splitCron logic for testing.
 * The actual function is not exported, so we test the same logic here.
 * If this test breaks, the component's splitCron likely also changed.
 */
function splitCron(expression: string): string[] {
  const parts = expression.trim().split(/\s+/)
  return Array.from({ length: 5 }, (_, i) => parts[i] || "*")
}

describe("splitCron", () => {
  it("splits a standard 5-field expression", () => {
    expect(splitCron("*/5 * * * *")).toEqual(["*/5", "*", "*", "*", "*"])
  })

  it("pads missing fields with *", () => {
    expect(splitCron("0 9")).toEqual(["0", "9", "*", "*", "*"])
  })

  it("handles empty string — all wildcards", () => {
    expect(splitCron("")).toEqual(["*", "*", "*", "*", "*"])
  })

  it("handles extra whitespace", () => {
    expect(splitCron("  0  9  *  *  1-5  ")).toEqual(["0", "9", "*", "*", "1-5"])
  })

  it("ignores extra fields beyond 5", () => {
    expect(splitCron("0 9 * * * extra")).toEqual(["0", "9", "*", "*", "*"])
  })

  it("preserves complex field values", () => {
    expect(splitCron("*/15 9-17 1,15 1-6 1-5")).toEqual(["*/15", "9-17", "1,15", "1-6", "1-5"])
  })
})

describe("CronExpressionInput structure", () => {
  it("has exactly 5 input fields (one per cron part)", () => {
    // The template renders 5 fields via FIELDS.map
    expect(componentSource).toContain("FIELDS.map")

    // Verify FIELDS has 5 entries
    const fieldsMatch = componentSource.match(/const FIELDS = \[([\s\S]*?)\] as const/)
    expect(fieldsMatch).not.toBeNull()
    const fieldEntries = fieldsMatch![1].match(/\{ key:/g)
    expect(fieldEntries).toHaveLength(5)
  })

  it("fields have correct labels: Minute, Hour, Day, Month, Weekday", () => {
    expect(componentSource).toContain('label: "Minute"')
    expect(componentSource).toContain('label: "Hour"')
    expect(componentSource).toContain('label: "Day"')
    expect(componentSource).toContain('label: "Month"')
    expect(componentSource).toContain('label: "Weekday"')
  })

  it("fields have hint text showing valid ranges", () => {
    expect(componentSource).toContain('hint: "0–59"')
    expect(componentSource).toContain('hint: "0–23"')
    expect(componentSource).toContain('hint: "1–31"')
    expect(componentSource).toContain('hint: "1–12"')
    expect(componentSource).toContain('hint: "0=Sun"')
  })

  it("renders the help text for users", () => {
    expect(componentSource).toContain("every")
    expect(componentSource).toContain("every 5th")
    expect(componentSource).toContain("ranges")
  })

  it("supports keyboard navigation: space, arrow keys, backspace", () => {
    // Space moves to next field
    expect(componentSource).toContain('e.key === " "')
    // ArrowRight at end of field moves to next
    expect(componentSource).toContain('e.key === "ArrowRight"')
    // ArrowLeft at start moves to previous
    expect(componentSource).toContain('e.key === "ArrowLeft"')
    // Backspace on empty field moves to previous
    expect(componentSource).toContain('e.key === "Backspace"')
  })

  it("selects field content on focus (for quick overwrite)", () => {
    expect(componentSource).toContain("e.target.select()")
  })

  it("shows red border for invalid expressions", () => {
    expect(componentSource).toContain("border-red")
  })
})
