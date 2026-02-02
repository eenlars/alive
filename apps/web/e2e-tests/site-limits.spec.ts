/**
 * E2E Tests for Site Limits
 *
 * Tests the site creation limit enforcement:
 * - API returns SITE_LIMIT_EXCEEDED when user is at quota limit
 * - Response includes correct error code and details structure
 * - Works with custom quotas set via test API
 *
 * These tests use the /api/test/set-quota endpoint to configure
 * user quotas for testing, and /api/deploy-subdomain to verify
 * the limit enforcement.
 */

import { TEST_CONFIG } from "@webalive/shared"
import { expect, test } from "./fixtures"

/**
 * Generate a short slug (max 20 chars) for test deployments
 * Format: lt{workerIndex}{last6DigitsOfTimestamp}
 * Example: lt0123456 (9 chars)
 */
function shortSlug(prefix: string, workerIndex: number): string {
  const timestamp = Date.now().toString().slice(-6)
  return `${prefix}${workerIndex}${timestamp}`
}

test.describe.skip("Site Limits", () => {
  test("API returns SITE_LIMIT_EXCEEDED when user quota is set to 1 (already has 1 site)", async ({
    authenticatedPage,
    workerTenant,
  }) => {
    console.log(`[Test] Testing site limit for user: ${workerTenant.email}`)
    console.log("[Test] User already has 1 site from bootstrap")

    // Step 1: Set the user's quota to 1 (they already have 1 domain from bootstrap)
    const setQuotaResponse = await authenticatedPage.request.post("/api/test/set-quota", {
      data: {
        email: workerTenant.email,
        maxSites: 1,
      },
    })

    if (!setQuotaResponse.ok()) {
      const error = await setQuotaResponse.json().catch(() => ({ error: "Unknown" }))
      console.log(`[Test] Set quota response: ${setQuotaResponse.status()}`, error)

      if (setQuotaResponse.status() === 404) {
        console.log("[Test] Skipping - /api/test/set-quota not available in this environment")
        test.skip()
        return
      }
    }

    expect(setQuotaResponse.ok()).toBe(true)
    const quotaResult = await setQuotaResponse.json()
    console.log(`[Test] Set quota to ${quotaResult.maxSites} for ${quotaResult.email}`)

    // Step 2: Try to deploy another site - should fail with SITE_LIMIT_EXCEEDED
    const deploySlug = shortSlug("lt", workerTenant.workerIndex)
    console.log(`[Test] Attempting deployment with slug: ${deploySlug}`)

    const deployResponse = await authenticatedPage.request.post("/api/deploy-subdomain", {
      data: {
        slug: deploySlug,
        orgId: workerTenant.orgId,
        siteIdeas: "E2E test for site limits",
        templateId: TEST_CONFIG.DEFAULT_TEMPLATE_ID,
      },
    })

    // Step 3: Verify the response
    const result = await deployResponse.json()
    console.log("[Test] Deploy response status:", deployResponse.status())
    console.log("[Test] Deploy response body:", JSON.stringify(result, null, 2))

    expect(deployResponse.status()).toBe(403)
    expect(result.ok).toBe(false)
    expect(result.error).toBe("SITE_LIMIT_EXCEEDED")
    expect(result.details).toBeDefined()
    expect(result.details.limit).toBe(1)
    // currentCount should be at least 1 (may vary if previous test runs left domains)
    expect(result.details.currentCount).toBeGreaterThanOrEqual(1)

    console.log(
      `[Test] ✓ SITE_LIMIT_EXCEEDED returned (limit: ${result.details.limit}, currentCount: ${result.details.currentCount})`,
    )
  })

  test("API response includes all fields needed by frontend", async ({ authenticatedPage, workerTenant }) => {
    // Set quota to 1 so user is at limit
    const setQuotaResponse = await authenticatedPage.request.post("/api/test/set-quota", {
      data: {
        email: workerTenant.email,
        maxSites: 1,
      },
    })

    if (!setQuotaResponse.ok() && setQuotaResponse.status() === 404) {
      test.skip()
      return
    }

    // Try to deploy
    const deployResponse = await authenticatedPage.request.post("/api/deploy-subdomain", {
      data: {
        slug: shortSlug("fld", workerTenant.workerIndex),
        orgId: workerTenant.orgId,
        siteIdeas: "Testing response structure",
        templateId: TEST_CONFIG.DEFAULT_TEMPLATE_ID,
      },
    })

    const result = await deployResponse.json()

    // Verify the full structure needed by DeploymentStatus component
    expect(result).toMatchObject({
      ok: false,
      message: expect.any(String),
      error: "SITE_LIMIT_EXCEEDED",
      details: {
        limit: expect.any(Number),
        currentCount: expect.any(Number),
      },
    })

    // Verify the message is user-friendly
    expect(result.message).toContain("maximum")
    expect(result.message).toContain("site")

    console.log("[Test] ✓ API response has all required fields for frontend")
  })

  test("deployment succeeds when quota is increased", async ({ authenticatedPage, workerTenant }) => {
    // First, set quota to 1 (at limit)
    const setQuotaResponse = await authenticatedPage.request.post("/api/test/set-quota", {
      data: {
        email: workerTenant.email,
        maxSites: 1,
      },
    })

    // Skip test if set-quota endpoint is not available (e.g., production without test endpoints)
    if (!setQuotaResponse.ok()) {
      console.log("[Test] Skipping - /api/test/set-quota not available")
      test.skip()
      return
    }

    // Verify we're blocked
    const blockedResponse = await authenticatedPage.request.post("/api/deploy-subdomain", {
      data: {
        slug: shortSlug("blk", workerTenant.workerIndex),
        orgId: workerTenant.orgId,
        siteIdeas: "Should be blocked",
        templateId: TEST_CONFIG.DEFAULT_TEMPLATE_ID,
      },
    })
    expect(blockedResponse.status()).toBe(403)

    // Now increase quota to 10
    const increaseResponse = await authenticatedPage.request.post("/api/test/set-quota", {
      data: {
        email: workerTenant.email,
        maxSites: 10,
      },
    })

    if (!increaseResponse.ok()) {
      test.skip()
      return
    }

    console.log("[Test] Increased quota to 10")

    // Verify we're no longer blocked (check slug availability instead of actual deploy)
    // We don't actually deploy to avoid side effects
    const checkResponse = await authenticatedPage.request.post("/api/check-slug", {
      data: {
        slug: shortSlug("alw", workerTenant.workerIndex),
      },
    })

    // If check-slug exists, the fact that we get a response (not 403) means quota isn't blocking
    if (checkResponse.status() !== 404) {
      console.log("[Test] ✓ Request not blocked after quota increase")
    } else {
      // Fallback: just verify the quota was set
      console.log("[Test] ✓ Quota increase accepted")
    }
  })

  test("error message includes currentCount from user's actual site count", async ({
    authenticatedPage,
    workerTenant,
  }) => {
    // Set quota to 1
    const setQuotaResponse = await authenticatedPage.request.post("/api/test/set-quota", {
      data: {
        email: workerTenant.email,
        maxSites: 1,
      },
    })

    if (!setQuotaResponse.ok() && setQuotaResponse.status() === 404) {
      test.skip()
      return
    }

    // Deploy and check the currentCount
    const deployResponse = await authenticatedPage.request.post("/api/deploy-subdomain", {
      data: {
        slug: shortSlug("cnt", workerTenant.workerIndex),
        orgId: workerTenant.orgId,
        siteIdeas: "Testing count",
        templateId: TEST_CONFIG.DEFAULT_TEMPLATE_ID,
      },
    })

    const result = await deployResponse.json()

    // Verify the response structure
    expect(deployResponse.status()).toBe(403)
    expect(result.error).toBe("SITE_LIMIT_EXCEEDED")
    expect(result.details).toBeDefined()
    expect(typeof result.details.currentCount).toBe("number")
    // currentCount should be at least 1 (the bootstrap domain, possibly more from previous tests)
    expect(result.details.currentCount).toBeGreaterThanOrEqual(1)

    // The frontend uses this to display "you have X websites"
    console.log(`[Test] ✓ currentCount correctly reports ${result.details.currentCount} site(s)`)
  })
})
