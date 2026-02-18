/**
 * Tests for AutomationSidePanel structure and trigger-specific behavior.
 *
 * Rendering tests are not enabled in this suite, so we use source assertions
 * to lock critical logic against regressions.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const dir = join(process.cwd(), "components/automations")
const panelSource = readFileSync(join(dir, "AutomationSidePanel.tsx"), "utf-8")
const triggerTabSource = readFileSync(join(dir, "tabs/TriggerTab.tsx"), "utf-8")

describe("AutomationSidePanel trigger behavior", () => {
  it("derives schedule/event behavior from trigger type", () => {
    expect(panelSource).toContain("const triggerType: TriggerType")
    expect(panelSource).toContain("const hasSchedule = isScheduleTrigger(triggerType)")
  })

  it("shows correct read-only badge labels for event triggers", () => {
    expect(triggerTabSource).toContain('"Email trigger"')
    expect(triggerTabSource).toContain('"Webhook trigger"')
  })

  it("shows email address only for email-triggered jobs", () => {
    expect(triggerTabSource).toContain('triggerType === "email" && editingJob.email_address')
  })

  it("locks recurring/one-time toggle while editing existing jobs", () => {
    expect(triggerTabSource).toContain("lockOneTimeToggle={isEditing}")
  })

  it("uses effective one-time mode when editing to avoid schedule field drift", () => {
    expect(panelSource).toContain('const effectiveIsOneTime = isEditing ? triggerType === "one-time" : isOneTime')
    expect(panelSource).toContain("cron_schedule: hasSchedule && !isOneTimeSubmit ? cronSchedule")
    expect(panelSource).toContain("run_at: hasSchedule && isOneTimeSubmit ? new Date(")
    expect(panelSource).toContain(').toISOString() : ""')
  })

  it("hides timezone controls for one-time mode to avoid non-functional settings", () => {
    expect(triggerTabSource).toContain("{!effectiveIsOneTime && (")
  })
})
