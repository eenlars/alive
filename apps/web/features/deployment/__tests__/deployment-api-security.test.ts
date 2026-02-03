/**
 * @vitest-environment node
 *
 * Deployment API Security Tests
 *
 * CRITICAL: These tests verify security boundaries that MUST NOT be broken.
 * If any of these tests fail, it indicates a serious security vulnerability.
 *
 * Test philosophy: Test behavior, not implementation. Test what MATTERS.
 */
import { COOKIE_NAMES, TEST_CONFIG } from "@webalive/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { DeploySubdomainResponse } from "@/features/deployment/types/deploy-subdomain"
import type { TestUser } from "@/lib/test-helpers/auth-test-helper"
import { cleanupTestUser, createTestUser } from "@/lib/test-helpers/auth-test-helper"
import { assertSupabaseServiceEnv, assertSystemTestEnv } from "@/lib/test-helpers/integration-env"
import { authenticatedFetch, callRouteHandler, loginAndGetSession } from "@/lib/test-helpers/test-auth-helpers"
import { API_ENDPOINTS, TEST_CREDENTIALS } from "@/lib/test-helpers/test-constants"

assertSystemTestEnv()
assertSupabaseServiceEnv()

describe("Deployment API Security", () => {
  let userA!: TestUser
  let userB!: TestUser
  let sessionA: string = ""
  let _sessionB: string = ""
  const createdUsers: TestUser[] = []

  beforeAll(async () => {
    // Create TWO users to test cross-user security
    userA = await createTestUser(undefined, TEST_CREDENTIALS.CREDITS, TEST_CREDENTIALS.PASSWORD)
    userB = await createTestUser(undefined, TEST_CREDENTIALS.CREDITS, TEST_CREDENTIALS.PASSWORD)
    createdUsers.push(userA, userB)

    // Get session cookies for both
    sessionA = await loginAndGetSession(userA.email)
    _sessionB = await loginAndGetSession(userB.email)
  })

  afterAll(async () => {
    for (const user of createdUsers) {
      await cleanupTestUser(user.userId)
    }
  })

  describe("Cross-User Security Boundary", () => {
    test("CRITICAL: User A cannot deploy to User B's organization", async () => {
      // This is the MOST IMPORTANT security test
      // If this fails, users can deploy to each other's orgs = BREACH

      const response = await authenticatedFetch(API_ENDPOINTS.DEPLOY_SUBDOMAIN, sessionA, {
        method: "POST",
        body: JSON.stringify({
          slug: `breach-attempt-${Date.now() % 10000}`,
          orgId: userB.orgId, // ❌ Trying to deploy to User B's org
          siteIdeas: "Hacking attempt",
          templateId: TEST_CONFIG.DEFAULT_TEMPLATE_ID,
        }),
      })

      expect(response.status).toBe(403)
      const result = (await response.json()) as DeploySubdomainResponse
      expect(result.ok).toBe(false)
      expect(result.error).toBe("ORG_ACCESS_DENIED")
      expect(result.message).toMatch(/do not have access/i)
    })

    test("CRITICAL: User cannot use non-existent orgId", async () => {
      const response = await authenticatedFetch(API_ENDPOINTS.DEPLOY_SUBDOMAIN, sessionA, {
        method: "POST",
        body: JSON.stringify({
          slug: `fake-org-${Date.now() % 10000}`,
          orgId: "org_nonexistent_12345", // Fake org
          siteIdeas: "",
          templateId: TEST_CONFIG.DEFAULT_TEMPLATE_ID,
        }),
      })

      expect(response.status).toBe(403)
      const result = (await response.json()) as DeploySubdomainResponse
      expect(result.ok).toBe(false)
      expect(result.error).toBe("ORG_ACCESS_DENIED")
    })
  })

  describe("Input Validation Security", () => {
    test("rejects slug with SQL injection attempt", async () => {
      const response = await authenticatedFetch(API_ENDPOINTS.DEPLOY_SUBDOMAIN, sessionA, {
        method: "POST",
        body: JSON.stringify({
          slug: "test'; DROP TABLE domains; --",
          orgId: userA.orgId,
        }),
      })

      expect(response.status).toBe(400)
      const result = (await response.json()) as DeploySubdomainResponse
      expect(result.ok).toBe(false)
      expect(result.error).toBe("VALIDATION_ERROR")
    })

    test("rejects slug with path traversal attempt", async () => {
      const response = await authenticatedFetch(API_ENDPOINTS.DEPLOY_SUBDOMAIN, sessionA, {
        method: "POST",
        body: JSON.stringify({
          slug: "../../../etc/passwd",
          orgId: userA.orgId,
        }),
      })

      expect(response.status).toBe(400)
      const result = (await response.json()) as DeploySubdomainResponse
      expect(result.ok).toBe(false)
    })

    test("rejects slug with uppercase letters", async () => {
      const response = await authenticatedFetch(API_ENDPOINTS.DEPLOY_SUBDOMAIN, sessionA, {
        method: "POST",
        body: JSON.stringify({
          slug: "TestSite",
          orgId: userA.orgId,
        }),
      })

      expect(response.status).toBe(400)
      const result = (await response.json()) as DeploySubdomainResponse
      expect(result.ok).toBe(false)
      expect(result.message).toMatch(/lowercase/)
    })

    test("rejects reserved slug 'api'", async () => {
      const response = await authenticatedFetch(API_ENDPOINTS.DEPLOY_SUBDOMAIN, sessionA, {
        method: "POST",
        body: JSON.stringify({
          slug: "api",
          orgId: userA.orgId,
        }),
      })

      // Should either reject as reserved OR as already taken
      expect(response.status).toBeGreaterThanOrEqual(400)
      const result = (await response.json()) as DeploySubdomainResponse
      expect(result.ok).toBe(false)
    })

    test("rejects slug starting with hyphen", async () => {
      const response = await authenticatedFetch(API_ENDPOINTS.DEPLOY_SUBDOMAIN, sessionA, {
        method: "POST",
        body: JSON.stringify({
          slug: "-invalid",
          orgId: userA.orgId,
        }),
      })

      expect(response.status).toBe(400)
    })

    test("rejects slug ending with hyphen", async () => {
      const response = await authenticatedFetch(API_ENDPOINTS.DEPLOY_SUBDOMAIN, sessionA, {
        method: "POST",
        body: JSON.stringify({
          slug: "invalid-",
          orgId: userA.orgId,
        }),
      })

      expect(response.status).toBe(400)
    })
  })

  describe("Authentication Edge Cases", () => {
    test("rejects request with tampered session cookie", async () => {
      const response = await authenticatedFetch(
        API_ENDPOINTS.DEPLOY_SUBDOMAIN,
        `${COOKIE_NAMES.SESSION}=tampered.jwt.token`,
        {
          method: "POST",
          body: JSON.stringify({
            slug: `test-${Date.now() % 10000}`,
            orgId: userA.orgId,
          }),
        },
      )

      expect(response.status).toBe(401)
      const result = (await response.json()) as DeploySubdomainResponse
      expect(result.ok).toBe(false)
    })

    test("rejects request with empty session cookie", async () => {
      const response = await authenticatedFetch(API_ENDPOINTS.DEPLOY_SUBDOMAIN, `${COOKIE_NAMES.SESSION}=`, {
        method: "POST",
        body: JSON.stringify({
          slug: `test-${Date.now() % 10000}`,
          orgId: userA.orgId,
        }),
      })

      expect(response.status).toBe(401)
    })
  })

  describe("Request Structure Validation", () => {
    test("validates orgId is a non-empty string", async () => {
      const response = await authenticatedFetch(API_ENDPOINTS.DEPLOY_SUBDOMAIN, sessionA, {
        method: "POST",
        body: JSON.stringify({
          slug: `test-${Date.now() % 10000}`,
          orgId: "", // Empty string
        }),
      })

      expect(response.status).toBe(400)
      const result = (await response.json()) as DeploySubdomainResponse
      expect(result.ok).toBe(false)
      expect(result.error).toBe("VALIDATION_ERROR")
    })

    test("validates slug length minimum (3 chars)", async () => {
      const response = await authenticatedFetch(API_ENDPOINTS.DEPLOY_SUBDOMAIN, sessionA, {
        method: "POST",
        body: JSON.stringify({
          slug: "ab",
          orgId: userA.orgId,
        }),
      })

      expect(response.status).toBe(400)
      const result = (await response.json()) as DeploySubdomainResponse
      expect(result.message).toMatch(/at least 3/)
    })

    test("validates slug length maximum (20 chars)", async () => {
      const response = await authenticatedFetch(API_ENDPOINTS.DEPLOY_SUBDOMAIN, sessionA, {
        method: "POST",
        body: JSON.stringify({
          slug: "this-is-a-very-long-slug-name",
          orgId: userA.orgId,
        }),
      })

      expect(response.status).toBe(400)
      const result = (await response.json()) as DeploySubdomainResponse
      expect(result.message).toMatch(/no more than 20/)
    })
  })

  describe("Error Response Shape", () => {
    test("validation errors have consistent shape", async () => {
      const response = await authenticatedFetch(API_ENDPOINTS.DEPLOY_SUBDOMAIN, sessionA, {
        method: "POST",
        body: JSON.stringify({
          slug: "ab", // Invalid
          orgId: userA.orgId,
        }),
      })

      const result = (await response.json()) as DeploySubdomainResponse

      // Every error response must have these fields
      expect(result).toHaveProperty("ok", false)
      expect(result).toHaveProperty("message")
      expect(typeof result.message).toBe("string")
      expect(result.message.length).toBeGreaterThan(0)
    })

    test("authentication errors return 401 with clear message", async () => {
      const response = await callRouteHandler(API_ENDPOINTS.DEPLOY_SUBDOMAIN, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // No cookie
        },
        body: JSON.stringify({
          slug: "test",
          orgId: userA.orgId,
        }),
      })

      expect(response.status).toBe(401)
      const result = (await response.json()) as DeploySubdomainResponse
      expect(result.ok).toBe(false)
      expect(result.message).toBeTruthy() // Message exists
      expect(typeof result.message).toBe("string")
      expect(result.message.length).toBeGreaterThan(0)
    })

    test("authorization errors return 403 with specific error code", async () => {
      const response = await authenticatedFetch(API_ENDPOINTS.DEPLOY_SUBDOMAIN, sessionA, {
        method: "POST",
        body: JSON.stringify({
          slug: `test-${Date.now() % 10000}`,
          orgId: userB.orgId, // Wrong org
        }),
      })

      expect(response.status).toBe(403)
      const result = (await response.json()) as DeploySubdomainResponse
      expect(result.ok).toBe(false)
      expect(result.error).toBe("ORG_ACCESS_DENIED")
    })
  })
})
