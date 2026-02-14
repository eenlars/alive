/**
 * Tests for CronScheduler structure.
 *
 * Rendering tests are not enabled in this suite, so we use source assertions
 * to lock critical behavior.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const componentSource = readFileSync(
  join(process.cwd(), "components/automations/cron-scheduler/CronScheduler.tsx"),
  "utf-8",
)

describe("CronScheduler one-time toggle behavior", () => {
  it("supports lockOneTimeToggle prop for read-only edit mode", () => {
    expect(componentSource).toContain("lockOneTimeToggle?: boolean")
    expect(componentSource).toContain("lockOneTimeToggle = false")
  })

  it("disables recurring/one-time buttons when lockOneTimeToggle is true", () => {
    const disabledCount = (componentSource.match(/disabled=\{lockOneTimeToggle\}/g) || []).length
    expect(disabledCount).toBe(2)
    expect(componentSource).toContain("cursor-not-allowed")
  })
})
