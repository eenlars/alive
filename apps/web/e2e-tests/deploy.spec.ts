/**
 * E2E Tests for Website Deployment with Authentication
 *
 * Tests the full deployment flow with required authentication
 */

import { execSync } from "node:child_process"
import { existsSync } from "node:fs"
import { TEST_CONFIG } from "@webalive/shared"
import { expect, test } from "./fixtures"
import { TEST_TIMEOUTS } from "./fixtures/test-data"
import { TIMEOUTS } from "./lib/test-env"

const TEST_SLUG = "test-e2e"
const TEST_DOMAIN = `${TEST_SLUG}.test.local`
const SITE_PATH = `/srv/webalive/sites/${TEST_DOMAIN}`

test.describe("Website Deployment with Authentication", () => {
  // Clean up before each test
  test.beforeEach(async () => {
    console.log(`[E2E Setup] Cleaning up test site: ${TEST_DOMAIN}`)

    // Stop systemd service first if running
    try {
      const serviceSlug = TEST_DOMAIN.replace(/\./g, "-")
      execSync(`systemctl stop site@${serviceSlug}.service 2>/dev/null || true`, { stdio: "ignore" })
      console.log(`[E2E Setup] Stopped service: site@${serviceSlug}.service`)
    } catch (_error) {
      // Service doesn't exist, that's fine
    }

    // Remove site directory if it exists (use rm -rf for better permission handling)
    if (existsSync(SITE_PATH)) {
      console.log(`[E2E Setup] Removing existing directory: ${SITE_PATH}`)
      try {
        execSync(`rm -rf "${SITE_PATH}"`, { stdio: "ignore" })
        console.log(`[E2E Setup] Removed directory: ${SITE_PATH}`)
      } catch (error) {
        console.error("[E2E Setup] Failed to remove directory:", error)
      }
    }

    console.log("[E2E Setup] Cleanup complete")
  })

  // Clean up after test completes
  test.afterEach(async () => {
    console.log(`[E2E Cleanup] Removing test site: ${TEST_DOMAIN}`)

    // Stop and disable systemd service first
    try {
      const serviceSlug = TEST_DOMAIN.replace(/\./g, "-")
      execSync(`systemctl stop site@${serviceSlug}.service 2>/dev/null || true`, { stdio: "ignore" })
      execSync(`systemctl disable site@${serviceSlug}.service 2>/dev/null || true`, { stdio: "ignore" })
      console.log("[E2E Cleanup] Stopped and disabled service")
    } catch (_error) {
      // Best effort cleanup
    }

    // Remove site directory (use rm -rf for better permission handling)
    if (existsSync(SITE_PATH)) {
      try {
        execSync(`rm -rf "${SITE_PATH}"`, { stdio: "ignore" })
        console.log(`[E2E Cleanup] Removed directory: ${SITE_PATH}`)
      } catch (error) {
        console.error("[E2E Cleanup] Failed to remove directory:", error)
      }
    }

    console.log("[E2E Cleanup] Complete")
  })

  test("deploy page is accessible without authentication", async ({ page }) => {
    console.log("[Test] Navigate to /deploy without authentication")
    await page.goto("/deploy", { waitUntil: "domcontentloaded" })

    // Allow both old/new heading copy and tolerate slower client hydration under parallel load.
    try {
      await expect(page.getByTestId("deploy-heading")).toBeVisible({ timeout: TEST_TIMEOUTS.max })
    } catch {
      await expect(page.getByRole("heading", { level: 1, name: /Launch your (site|website)/i })).toBeVisible({
        timeout: TEST_TIMEOUTS.max,
      })
    }

    try {
      await expect(page.getByTestId("mode-option-quick-launch")).toBeVisible({ timeout: TEST_TIMEOUTS.max })
    } catch {
      await expect(page.getByRole("heading", { level: 3, name: "Quick Launch" })).toBeVisible({
        timeout: TEST_TIMEOUTS.max,
      })
    }

    console.log("[Test] ✓ Deploy page accessible without authentication")
  })

  test("deployment API rejects unauthenticated requests", async ({ request }) => {
    console.log("[Test] Testing API without authentication")

    const response = await request.post("/api/deploy-subdomain", {
      data: {
        slug: TEST_SLUG,
        orgId: "org_fake123", // Fake org ID - doesn't matter for unauthenticated test
        siteIdeas: "",
        templateId: TEST_CONFIG.DEFAULT_TEMPLATE_ID,
      },
    })

    expect(response.status()).toBe(401)
    const result = await response.json()
    expect(result.ok).toBe(false)
    console.log("[Test] ✓ Unauthenticated request properly rejected")
  })

  // TODO: Enable when safe to run actual deployments in E2E tests
  test.skip("deployment API allows authenticated requests without explicit orgId", async ({ authenticatedPage }) => {
    // Current API behavior: if orgId is not provided, a default org is created
    // This test verifies that authenticated users can deploy without explicit orgId
    test.setTimeout(TIMEOUTS.DEPLOYMENT)

    console.log("[Test] Testing API with authenticated user but no orgId")

    // Use page.request to ensure cookies are sent
    const response = await authenticatedPage.request.post("/api/deploy-subdomain", {
      data: {
        slug: TEST_SLUG,
        // No email needed - authenticated via cookie
        // No orgId provided - should use default org
        siteIdeas: "Test deployment without explicit orgId",
        templateId: TEST_CONFIG.DEFAULT_TEMPLATE_ID,
      },
    })

    // Should succeed even without orgId (default org will be created/used)
    expect(response.status()).toBe(200)
    const result = await response.json()
    expect(result.ok).toBe(true)
    expect(result.domain).toBe(TEST_DOMAIN)
    console.log("[Test] ✓ Authenticated user can deploy without explicit orgId")
  })

  // TODO: Enable when safe to run actual deployments in E2E tests
  test.skip("can deploy with valid authentication and orgId - full flow", async ({
    authenticatedPage,
    workerTenant,
  }) => {
    // Full deployment test with authentication and explicit orgId
    // Takes ~70s for actual deployment (local), longer for remote environments
    test.setTimeout(TIMEOUTS.DEPLOYMENT)

    console.log("[Test] Full authenticated deployment flow with orgId")

    console.log(`[Test] Deploying with user: ${workerTenant.email}, org: ${workerTenant.orgId}`)

    const response = await authenticatedPage.request.post("/api/deploy-subdomain", {
      data: {
        slug: TEST_SLUG,
        // No email needed - authenticated via cookie
        orgId: workerTenant.orgId,
        siteIdeas: "E2E test deployment with authentication",
        templateId: TEST_CONFIG.DEFAULT_TEMPLATE_ID,
      },
    })

    if (!response.ok()) {
      const error = await response.json()
      console.error("[Test] Deployment failed:", error)
      throw new Error(`Deployment failed: ${error.message}`)
    }

    const result = await response.json()
    expect(result.ok).toBe(true)
    expect(result.domain).toBe(TEST_DOMAIN)
    expect(result.orgId).toBe(workerTenant.orgId)

    console.log("[Test] ✓ Deployment succeeded")

    // Verify site directory exists
    expect(existsSync(SITE_PATH)).toBe(true)
    console.log("[Test] ✓ Site directory created")

    // Verify systemd service is running
    try {
      const serviceSlug = TEST_DOMAIN.replace(/\./g, "-")
      const status = execSync(`systemctl is-active site@${serviceSlug}.service`, { encoding: "utf-8" }).trim()
      expect(status).toBe("active")
      console.log("[Test] ✓ Systemd service is active")
    } catch (_error) {
      throw new Error("Systemd service is not active")
    }
  })
})
