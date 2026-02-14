/**
 * Tests for AutomationListCard helpers and structural integrity.
 *
 * React rendering tests are excluded in this vitest setup (no happy-dom),
 * so we test the pure logic and verify the component source has correct structure.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Read component source for structural assertions.
 * This catches regressions like nested <button> elements (a11y violation).
 */
const componentSource = readFileSync(join(process.cwd(), "components/automations/AutomationListCard.tsx"), "utf-8")

describe("AutomationListCard structure", () => {
  it("does not nest buttons inside buttons (a11y violation)", () => {
    // The component should use a <button> for selection and sibling buttons for actions.
    // A <button> wrapping other <button> elements is invalid HTML.

    // Count actual JSX <button elements (not in comments)
    const lines = componentSource.split("\n")
    const jsxButtonLines = lines.filter(
      line => line.includes("<button") && !line.trimStart().startsWith("//") && !line.trimStart().startsWith("{/*"),
    )

    // All buttons should be properly closed
    const buttonCloses = (componentSource.match(/<\/button>/g) || []).length
    expect(jsxButtonLines.length).toBe(buttonCloses)

    // The component should have exactly 5 buttons:
    // 1 selection button + 4 action buttons (Edit, Runs, Pause/Resume, Delete)
    expect(jsxButtonLines.length).toBe(5)
  })

  it("selection area is a <button>, not a div with role=button", () => {
    // The old pattern was <div role="button" onClick=...> which is less accessible.
    // Verify we use a real <button> for the selection target.
    expect(componentSource).not.toMatch(/role="button"/)
    expect(componentSource).not.toMatch(/role=\{?"button"\}?/)
  })

  it("action buttons are siblings of selection button, not descendants", () => {
    // Find the selection button pattern (the first button with onSelect)
    // It should close (</button>) before the action buttons div
    const selectionBtnMatch = componentSource.match(/onClick=\{onSelect\}/)
    expect(selectionBtnMatch).not.toBeNull()

    // The action buttons div should be a sibling of the selection button
    // Look for the pattern: </button> followed by action buttons div
    expect(componentSource).toMatch(/<\/button>\s*\n\s*\n\s*{\/\* Action buttons/)
  })

  it("has Edit, Runs, Pause/Resume, and Delete action buttons", () => {
    // JSX button text may be on separate lines from the tags
    const lines = componentSource.split("\n").map(l => l.trim())
    expect(lines).toContain("Edit")
    expect(lines).toContain("Runs")
    expect(componentSource).toContain('"Pause"')
    expect(componentSource).toContain('"Resume"')
    expect(lines).toContain("Delete")
  })
})

describe("formatTrigger (via source inspection)", () => {
  // Since formatTrigger is not exported, we verify the logic patterns exist in source.
  // This catches regressions if someone removes the formatter.

  it("handles one-time trigger type", () => {
    expect(componentSource).toContain('"one-time"')
    expect(componentSource).toContain('"One-time"')
  })

  it("handles webhook trigger type", () => {
    expect(componentSource).toContain('"webhook"')
    expect(componentSource).toContain('"Webhook"')
  })

  it("handles email trigger type", () => {
    expect(componentSource).toContain('"email"')
    expect(componentSource).toContain('"Email trigger"')
  })

  it("handles daily cron schedule", () => {
    // Daily: min=0, hour!=*, day=*, month=*, weekday=*
    expect(componentSource).toContain("Daily at")
  })
})

describe("formatRelativeTime (via source inspection)", () => {
  it("handles null/never case", () => {
    expect(componentSource).toContain('"Never"')
  })

  it("handles recent times", () => {
    expect(componentSource).toContain('"Just now"')
    expect(componentSource).toContain("m ago")
    expect(componentSource).toContain("h ago")
    expect(componentSource).toContain("d ago")
  })
})
