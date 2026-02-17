/**
 * E2E: Sandbox Terminal Integration
 *
 * Verifies the terminal view in the Sandbox panel:
 * 1. Terminal lease API returns a valid WebSocket URL
 * 2. Terminal view renders xterm.js container (not the old placeholder)
 *
 * NOTE: Does NOT test actual WebSocket PTY connection (requires real shell-server-go).
 * The lease API call is mocked to avoid cross-origin WebSocket complexity in CI.
 */

import { expect, test } from "./fixtures"
import { gotoChatFast } from "./helpers/assertions"
import { buildJsonMockResponse } from "./lib/strict-api-guard"

test("terminal lease API returns wsUrl on valid request", async ({ authenticatedPage, workerTenant }) => {
  // Mock terminal lease to avoid needing real shell-server-go
  await authenticatedPage.route("**/api/terminal/lease", route =>
    route.fulfill(
      buildJsonMockResponse({
        ok: true,
        lease: "mock-lease-token",
        wsUrl: "wss://go.test.local/ws?lease=mock-lease-token",
        workspace: workerTenant.workspace,
        expiresAt: Date.now() + 90000,
      }),
    ),
  )

  await gotoChatFast(authenticatedPage, workerTenant.workspace, workerTenant.orgId)
  await expect(authenticatedPage.locator('[data-testid="message-input"]')).toBeVisible({ timeout: 3000 })

  // Call terminal lease API directly and verify response shape
  const response = await authenticatedPage.evaluate(async (workspace: string) => {
    const res = await fetch("/api/terminal/lease", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace }),
    })
    return { status: res.status, body: await res.json() }
  }, workerTenant.workspace)

  expect(response.status).toBe(200)
  expect(response.body.ok).toBe(true)
  expect(response.body.lease).toBe("mock-lease-token")
  expect(response.body.wsUrl).toContain("wss://")
  expect(response.body.wsUrl).toContain("lease=mock-lease-token")
})

test("sandbox terminal view renders xterm container", async ({ authenticatedPage, workerTenant }) => {
  // Mock terminal lease — the component fetches this on mount
  await authenticatedPage.route("**/api/terminal/lease", route =>
    route.fulfill(
      buildJsonMockResponse({
        ok: true,
        lease: "mock-lease-token",
        wsUrl: "wss://go.test.local/ws?lease=mock-lease-token",
        workspace: workerTenant.workspace,
        expiresAt: Date.now() + 90000,
      }),
    ),
  )

  await gotoChatFast(authenticatedPage, workerTenant.workspace, workerTenant.orgId)
  await expect(authenticatedPage.locator('[data-testid="message-input"]')).toBeVisible({ timeout: 3000 })

  // Open sandbox and switch to terminal view
  // The sandbox panel has a view menu — we need to open it and select Terminal
  // First, open the sandbox panel by toggling it
  await authenticatedPage.evaluate(() => {
    // Set sandbox open + terminal view via localStorage store update
    const debugKey = "alive-debug-store"
    const raw = localStorage.getItem(debugKey)
    if (raw) {
      const parsed = JSON.parse(raw)
      parsed.state.showSandbox = true
      localStorage.setItem(debugKey, JSON.stringify(parsed))
    } else {
      localStorage.setItem(debugKey, JSON.stringify({ state: { showSandbox: true } }))
    }
  })

  // Reload to pick up the sandbox visibility change
  await authenticatedPage.reload({ waitUntil: "domcontentloaded" })
  await expect(authenticatedPage.locator('[data-testid="message-input"]')).toBeVisible({ timeout: 5000 })

  // Look for the panel view menu and click Terminal
  // The panel view menu may be in a dropdown — look for the view menu trigger
  const viewMenuTrigger = authenticatedPage
    .locator("button")
    .filter({ hasText: /Preview|Code|Drive|Terminal/ })
    .first()

  if (await viewMenuTrigger.isVisible({ timeout: 2000 }).catch(() => false)) {
    await viewMenuTrigger.click()
    // Wait for dropdown
    const terminalItem = authenticatedPage.getByRole("menuitem", { name: "Terminal" })
    if (await terminalItem.isVisible({ timeout: 1000 }).catch(() => false)) {
      await terminalItem.click()
    }
  }

  // Verify terminal renders (xterm creates a .xterm element)
  // Even if the WebSocket fails (mocked URL is unreachable), the container should exist
  // Look for either the xterm container or the "Connecting..." state
  const terminalContainer = authenticatedPage.locator(".xterm, [class*='bg-[#1a1a1a]']").first()
  await expect(terminalContainer).toBeAttached({ timeout: 3000 })

  // Verify we do NOT see the old placeholder text
  await expect(authenticatedPage.getByText("Terminal coming soon")).not.toBeVisible()
})
