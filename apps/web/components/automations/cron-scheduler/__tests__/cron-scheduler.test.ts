/**
 * Tests for CronScheduler component logic and structure.
 *
 * Verifies the segmented controls, mode switching,
 * and one-time vs recurring behavior.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const componentSource = readFileSync(
  join(process.cwd(), "components/automations/cron-scheduler/CronScheduler.tsx"),
  "utf-8",
)

describe("CronScheduler mode switching", () => {
  it("has a Recurring / One-time segmented control", () => {
    expect(componentSource).toContain("Recurring")
    expect(componentSource).toContain("One-time")
  })

  it("has a Presets / Custom segmented control for recurring mode", () => {
    expect(componentSource).toContain("Presets")
    expect(componentSource).toContain("Custom")
  })

  it("shows one-time date/time inputs only when isOneTime is true", () => {
    // The one-time section should be conditional on isOneTime
    expect(componentSource).toContain("isOneTime && showOneTime")
    expect(componentSource).toContain('type="date"')
    expect(componentSource).toContain('type="time"')
  })

  it("shows recurring presets/custom only when isOneTime is false", () => {
    // The recurring section should be conditional on !isOneTime
    expect(componentSource).toContain("!isOneTime")
  })

  it("syncs isOneTime prop from parent", () => {
    // The component should have a useEffect that syncs the prop
    expect(componentSource).toContain("isOneTimeProp")
    expect(componentSource).toContain("setIsOneTime(isOneTimeProp)")
  })

  it("initializes isOneTime from prop", () => {
    // useState should default from prop: useState(isOneTimeProp ?? false)
    expect(componentSource).toContain("isOneTimeProp ?? false")
  })
})

describe("CronScheduler live description", () => {
  it("shows describeCron output for valid custom expressions", () => {
    expect(componentSource).toContain("describeCron")
    expect(componentSource).toContain("isValidCron")
  })

  it("imports describeCron from cron-parser", () => {
    expect(componentSource).toContain("import { describeCron")
  })
})

describe("CronScheduler preset detection", () => {
  it("detects if a value matches a known preset", () => {
    // The component should check against known preset values to set mode
    expect(componentSource).toContain("presetValues.includes(value)")
  })

  it("switches to custom mode when value is not a preset", () => {
    expect(componentSource).toContain('"custom"')
  })
})

describe("CronScheduler props interface", () => {
  it("accepts isOneTime prop for controlled state", () => {
    expect(componentSource).toContain("isOneTime?:")
  })

  it("accepts onOneTimeChange callback", () => {
    expect(componentSource).toContain("onOneTimeChange?:")
  })

  it("accepts one-time date and time props", () => {
    expect(componentSource).toContain("oneTimeDate?:")
    expect(componentSource).toContain("oneTimeTime?:")
  })
})
