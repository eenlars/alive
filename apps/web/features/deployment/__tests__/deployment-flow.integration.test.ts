/**
 * @vitest-environment node
 *
 * Full Deployment Flow Integration Tests
 * Tests the complete authenticated deployment flow from API to site deployment
 */
import { execSync } from "node:child_process"
import { existsSync, rmSync } from "node:fs"
import { TEST_CONFIG } from "@webalive/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { TestUser } from "@/lib/test-helpers/auth-test-helper"
import { cleanupTestUser, createTestUser } from "@/lib/test-helpers/auth-test-helper"
import { assertSupabaseServiceEnv, assertSystemTestEnv } from "@/lib/test-helpers/integration-env"
import { authenticatedFetch, callRouteHandler, loginAndGetSession } from "@/lib/test-helpers/test-auth-helpers"
import { API_ENDPOINTS, TEST_CREDENTIALS } from "@/lib/test-helpers/test-constants"

assertSystemTestEnv()
assertSupabaseServiceEnv()

describe("Full Deployment Flow Integration", () => {
  const testSlug = "test-flow"
  const testDomain = `${testSlug}.alive.best`
  const sitePath = `/srv/webalive/sites/${testDomain}`

  let testUser!: TestUser
  let sessionCookie: string = ""
  const createdUsers: TestUser[] = []

  beforeAll(async () => {
    // Create test user with organization and password (auto-generates internal test domain)
    testUser = await createTestUser(undefined, TEST_CREDENTIALS.CREDITS, TEST_CREDENTIALS.PASSWORD)
    createdUsers.push(testUser)
    console.log(`[Test Setup] Created test user: ${testUser.email} with org: ${testUser.orgId}`)

    // Login to get real session cookie
    sessionCookie = await loginAndGetSession(testUser.email)
    console.log("[Test Setup] Got session cookie")
  })

  afterAll(async () => {
    // Cleanup test user
    for (const user of createdUsers) {
      await cleanupTestUser(user.userId)
    }
    console.log("[Test Cleanup] Removed test user and org")
  })

  // Cleanup before test
  try {
    if (existsSync(sitePath)) {
      rmSync(sitePath, { recursive: true, force: true })
    }
    const serviceSlug = testDomain.replace(/\./g, "-")
    execSync(`systemctl stop site@${serviceSlug}.service 2>/dev/null || true`, { stdio: "ignore" })
  } catch (_error) {
    // Ignore cleanup errors
  }

  test("deployment flow rejects unauthenticated requests", async () => {
    console.log("[Flow Test] Step 1: Call deployment API without authentication")

    const apiResponse = await callRouteHandler(API_ENDPOINTS.DEPLOY_SUBDOMAIN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: testSlug,
        orgId: testUser.orgId,
        siteIdeas: "",
        templateId: TEST_CONFIG.DEFAULT_TEMPLATE_ID,
      }),
    })

    expect(apiResponse.status).toBe(401)
    const apiResult = await apiResponse.json()
    expect(apiResult.ok).toBe(false)
    console.log("[Flow Test] ✓ Unauthenticated request rejected")
  })

  test("deployment flow allows requests without orgId (auto-creates default org)", async () => {
    console.log("[Flow Test] Step 1: Call deployment API without orgId")

    const apiResponse = await authenticatedFetch(API_ENDPOINTS.DEPLOY_SUBDOMAIN, sessionCookie, {
      method: "POST",
      body: JSON.stringify({
        slug: `${testSlug}-auto-org`,
        // orgId omitted - should auto-create default org
        siteIdeas: "",
        templateId: TEST_CONFIG.DEFAULT_TEMPLATE_ID,
      }),
    })

    // Should not reject with 400 for missing orgId - it's optional
    expect(apiResponse.status).not.toBe(400)
    console.log("[Flow Test] ✓ Request without orgId accepted (optional field)")
  })

  test.skip("full deployment flow: API call with auth -> site deployment", async () => {
    // Skip this test unless explicitly running full deployment tests
    // Takes ~60s and requires system access
    console.log("[Flow Test] Full authenticated deployment flow")

    const apiResponse = await authenticatedFetch(API_ENDPOINTS.DEPLOY_SUBDOMAIN, sessionCookie, {
      method: "POST",
      body: JSON.stringify({
        slug: testSlug,
        orgId: testUser.orgId,
        siteIdeas: "",
        templateId: TEST_CONFIG.DEFAULT_TEMPLATE_ID,
      }),
    })

    const apiResult = await apiResponse.json()
    console.log("[Flow Test] API result:", apiResult)

    // API should succeed
    if (!apiResult.ok) {
      console.error("[Flow Test] API failed:", apiResult.message)
      throw new Error(`API failed: ${apiResult.message}`)
    }

    expect(apiResult.ok).toBe(true)
    expect(apiResult.domain).toBe(testDomain)
    expect(apiResult.orgId).toBe(testUser.orgId)

    // Verify site was deployed
    expect(existsSync(sitePath)).toBe(true)
    console.log("[Flow Test] ✓ Site directory created")

    // Verify systemd service is running
    const serviceSlug = testDomain.replace(/\./g, "-")
    const status = execSync(`systemctl is-active site@${serviceSlug}.service`, { encoding: "utf-8" }).trim()
    expect(status).toBe("active")
    console.log("[Flow Test] ✓ Systemd service is active")

    // Cleanup
    rmSync(sitePath, { recursive: true, force: true })
    execSync(`systemctl stop site@${serviceSlug}.service`)
  }, 60000)
})
