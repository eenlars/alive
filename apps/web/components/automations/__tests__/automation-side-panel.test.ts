/**
 * Tests for AutomationSidePanel structure and trigger-specific behavior.
 *
 * Rendering tests are not enabled in this suite, so we use source assertions
 * to lock critical logic against regressions.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const componentSource = readFileSync(join(process.cwd(), "components/automations/AutomationSidePanel.tsx"), "utf-8")

describe("AutomationSidePanel trigger behavior", () => {
  it("derives schedule/event behavior from trigger type", () => {
    expect(componentSource).toContain("const triggerType: TriggerType")
    expect(componentSource).toContain("const hasSchedule = isScheduleTrigger(triggerType)")
  })

  it("shows correct read-only badge labels for event triggers", () => {
    expect(componentSource).toContain('"Email trigger"')
    expect(componentSource).toContain('"Webhook trigger"')
  })

  it("shows email address only for email-triggered jobs", () => {
    expect(componentSource).toContain('triggerType === "email" && editingJob.email_address')
  })

  it("locks recurring/one-time toggle while editing existing jobs", () => {
    expect(componentSource).toContain("lockOneTimeToggle={isEditing}")
  })

  it("uses effective one-time mode when editing to avoid schedule field drift", () => {
    expect(componentSource).toContain('const effectiveIsOneTime = editingJob ? triggerType === "one-time" : isOneTime')
    expect(componentSource).toContain('cron_schedule: hasSchedule && !effectiveIsOneTime ? cronSchedule : ""')
    expect(componentSource).toContain("run_at: hasSchedule && effectiveIsOneTime ? new Date(")
    expect(componentSource).toContain(').toISOString() : ""')
  })

  it("hides timezone controls for one-time mode to avoid non-functional settings", () => {
    expect(componentSource).toContain("{!effectiveIsOneTime && (")
  })
})
