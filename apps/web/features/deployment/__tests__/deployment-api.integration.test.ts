/**
 * @vitest-environment node
 *
 * Deployment API Integration Tests
 *
 * Philosophy: Test BEHAVIOR and BUSINESS LOGIC, not just "does it reject bad input"
 * These tests verify the deployment flow works end-to-end with real authentication
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

describe("Deployment API Integration", () => {
  let testUser!: TestUser
  let sessionCookie: string = ""
  const createdUsers: TestUser[] = []

  beforeAll(async () => {
    // Create test user with organization and password (auto-generates internal test domain)
    testUser = await createTestUser(undefined, TEST_CREDENTIALS.CREDITS, TEST_CREDENTIALS.PASSWORD)
    createdUsers.push(testUser)

    // Login to get real session cookie
    sessionCookie = await loginAndGetSession(testUser.email)
  })

  afterAll(async () => {
    for (const user of createdUsers) {
      await cleanupTestUser(user.userId)
    }
  })

  describe("Authentication Layer", () => {
    test("rejects request with no authentication", async () => {
      const response = await callRouteHandler(API_ENDPOINTS.DEPLOY_SUBDOMAIN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: `test-${Date.now() % 10000}`,
          orgId: testUser.orgId,
        }),
      })

      expect(response.status).toBe(401)
      const result = (await response.json()) as DeploySubdomainResponse
      expect(result.ok).toBe(false)
      expect(result.message).toBeTruthy() // Message exists
      expect(typeof result.message).toBe("string")
      expect(result.message.length).toBeGreaterThan(0)
    })

    test("rejects request with invalid session token", async () => {
      const response = await callRouteHandler(API_ENDPOINTS.DEPLOY_SUBDOMAIN, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${COOKIE_NAMES.SESSION}=invalid.jwt.token`,
        },
        body: JSON.stringify({
          slug: `test-${Date.now() % 10000}`,
          orgId: testUser.orgId,
        }),
      })

      expect(response.status).toBe(401)
    })
  })

  describe("Request Validation", () => {
    test("orgId is optional - auto-creates default org if not provided", async () => {
      const response = await authenticatedFetch(API_ENDPOINTS.DEPLOY_SUBDOMAIN, sessionCookie, {
        method: "POST",
        body: JSON.stringify({
          slug: `test-auto-org-${Date.now() % 10000}`,
          // orgId omitted - should auto-create default org
          siteIdeas: "Testing auto org creation",
          templateId: TEST_CONFIG.DEFAULT_TEMPLATE_ID,
        }),
      })

      // Should not reject - orgId is optional
      expect(response.status).not.toBe(400)
      // If it fails, it should be for a different reason (DNS, deployment, etc)
      // But the request should be valid from a schema perspective
    })

    test("validates slug meets minimum length (3 chars)", async () => {
      const response = await authenticatedFetch(API_ENDPOINTS.DEPLOY_SUBDOMAIN, sessionCookie, {
        method: "POST",
        body: JSON.stringify({
          slug: "ab",
          orgId: testUser.orgId,
        }),
      })

      expect(response.status).toBe(400)
      const result = (await response.json()) as DeploySubdomainResponse
      expect(result.message).toMatch(/at least 3/)
    })

    test("validates slug meets maximum length (20 chars)", async () => {
      const response = await authenticatedFetch(API_ENDPOINTS.DEPLOY_SUBDOMAIN, sessionCookie, {
        method: "POST",
        body: JSON.stringify({
          slug: "this-slug-is-way-too-long-for-deployment",
          orgId: testUser.orgId,
        }),
      })

      expect(response.status).toBe(400)
      const result = (await response.json()) as DeploySubdomainResponse
      expect(result.message).toMatch(/no more than 20/)
    })

    test("validates slug format (lowercase, numbers, hyphens only)", async () => {
      const invalidSlugs = [
        "Test-Site", // Uppercase
        "test_site", // Underscore
        "test site", // Space
        "test.site", // Dot
        "-testsite", // Starts with hyphen
        "testsite-", // Ends with hyphen
      ]

      for (const slug of invalidSlugs) {
        const response = await authenticatedFetch(API_ENDPOINTS.DEPLOY_SUBDOMAIN, sessionCookie, {
          method: "POST",
          body: JSON.stringify({
            slug,
            orgId: testUser.orgId,
          }),
        })

        expect(response.status).toBe(400)
        const result = (await response.json()) as DeploySubdomainResponse
        expect(result.ok).toBe(false)
        expect(result.error).toBe("VALIDATION_ERROR")
      }
    })

    test("rejects reserved slugs (api, admin, www, etc.)", async () => {
      const reservedSlugs = ["api", "admin", "www", "test", "staging"]

      for (const slug of reservedSlugs) {
        const response = await authenticatedFetch(API_ENDPOINTS.DEPLOY_SUBDOMAIN, sessionCookie, {
          method: "POST",
          body: JSON.stringify({
            slug,
            orgId: testUser.orgId,
          }),
        })

        expect(response.status).toBe(400)
        const result = (await response.json()) as DeploySubdomainResponse
        expect(result.ok).toBe(false)
        expect(result.message).toMatch(/reserved/i)
      }
    })
  })

  describe("Error Response Format", () => {
    test("all errors have consistent response shape", async () => {
      const response = await authenticatedFetch(API_ENDPOINTS.DEPLOY_SUBDOMAIN, sessionCookie, {
        method: "POST",
        body: JSON.stringify({
          slug: "ab", // Invalid
          orgId: testUser.orgId,
        }),
      })

      const result = (await response.json()) as DeploySubdomainResponse

      // Every error must have these fields
      expect(result).toHaveProperty("ok", false)
      expect(result).toHaveProperty("message")
      expect(typeof result.message).toBe("string")
      expect(result.message.length).toBeGreaterThan(0)

      // Optional but recommended
      if (result.error) {
        expect(typeof result.error).toBe("string")
      }
    })

    test("validation errors return 400 with VALIDATION_ERROR code", async () => {
      const response = await authenticatedFetch(API_ENDPOINTS.DEPLOY_SUBDOMAIN, sessionCookie, {
        method: "POST",
        body: JSON.stringify({
          slug: "ab",
          orgId: testUser.orgId,
        }),
      })

      expect(response.status).toBe(400)
      const result = (await response.json()) as DeploySubdomainResponse
      expect(result.error).toBe("VALIDATION_ERROR")
    })

    test("auth errors return 401 with clear message", async () => {
      const response = await callRouteHandler(API_ENDPOINTS.DEPLOY_SUBDOMAIN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: "test",
          orgId: testUser.orgId,
        }),
      })

      expect(response.status).toBe(401)
      const result = (await response.json()) as DeploySubdomainResponse
      expect(result.ok).toBe(false)
      expect(result.message).toBeTruthy() // Message exists
      expect(typeof result.message).toBe("string")
      expect(result.message.length).toBeGreaterThan(0)
    })
  })

  describe("Edge Cases", () => {
    test("handles malformed JSON gracefully", async () => {
      const response = await authenticatedFetch(API_ENDPOINTS.DEPLOY_SUBDOMAIN, sessionCookie, {
        method: "POST",
        body: "{ invalid json }",
      })

      expect(response.status).toBe(400)
      const result = (await response.json()) as DeploySubdomainResponse
      expect(result.ok).toBe(false)
      expect(result.error).toBe("INVALID_JSON")
    })

    test("handles missing Content-Type header", async () => {
      const response = await callRouteHandler(API_ENDPOINTS.DEPLOY_SUBDOMAIN, {
        method: "POST",
        headers: { Cookie: sessionCookie },
        body: JSON.stringify({
          slug: "test",
          orgId: testUser.orgId,
        }),
      })

      // Should still work or return appropriate error
      expect([400, 415]).toContain(response.status)
    })
  })
})
