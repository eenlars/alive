import { describe, expect, it } from "vitest"
import { parseCronExpression } from "../cron-parser"
import { CRON_PRESETS, matchPreset } from "../cron-presets"

describe("CRON_PRESETS", () => {
  it("has exactly 6 presets", () => {
    expect(CRON_PRESETS).toHaveLength(6)
  })

  it("every preset has a valid cron expression", () => {
    for (const preset of CRON_PRESETS) {
      const parsed = parseCronExpression(preset.value)
      expect(parsed, `Preset "${preset.label}" has invalid cron: ${preset.value}`).not.toBeNull()
    }
  })

  it("every preset has a label, value, and description", () => {
    for (const preset of CRON_PRESETS) {
      expect(preset.label).toBeTruthy()
      expect(preset.value).toBeTruthy()
      expect(preset.description).toBeTruthy()
    }
  })

  it("descriptions are human-friendly, not just restating the label", () => {
    for (const preset of CRON_PRESETS) {
      // Description should not be identical to the label
      expect(preset.description).not.toBe(preset.label)
      // Description should not start with "Runs" (generic filler)
      expect(preset.description.startsWith("Runs ")).toBe(false)
    }
  })

  it("all preset values are unique", () => {
    const values = CRON_PRESETS.map(p => p.value)
    expect(new Set(values).size).toBe(values.length)
  })

  it("includes the essential schedules", () => {
    const labels = CRON_PRESETS.map(p => p.label)
    expect(labels).toContain("Every 5 minutes")
    expect(labels).toContain("Hourly")
    expect(labels).toContain("Daily at 9 AM")
    expect(labels).toContain("Weekdays at 9 AM")
  })
})

describe("matchPreset", () => {
  it("returns matching preset for known expression", () => {
    const result = matchPreset("*/5 * * * *")
    expect(result).not.toBeNull()
    expect(result?.label).toBe("Every 5 minutes")
  })

  it("returns null for unknown expression", () => {
    expect(matchPreset("*/7 * * * *")).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(matchPreset("")).toBeNull()
  })
})
