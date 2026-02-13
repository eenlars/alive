/**
 * Preview Subdomain E2E Tests
 *
 * Tests the preview subdomain infrastructure:
 * 1. TLS check endpoint — Caddy calls this before issuing on-demand certificates
 * 2. Preview-router authentication — JWT session cookie enforcement
 *
 * NOTE: The middleware rewrite (preview-- Host → /api/preview-router) and the
 * full proxy chain (auth → port lookup → proxy) cannot be tested via E2E because
 * the reverse proxy chain (Cloudflare → Caddy) overrides the Host/X-Forwarded-Host
 * headers that the middleware reads. These are tested via:
 * - Unit tests for middleware.ts and preview-utils.ts
 * - Manual curl: curl -H "Host: preview--x.<wildcard>" http://localhost:9000/
 *
 * Tests are environment-agnostic: they work on local, staging, and production.
 */

import { COOKIE_NAMES, TEST_CONFIG } from "@webalive/shared"
import jwt from "jsonwebtoken"
import { DEFAULT_USER_SCOPES } from "@/features/auth/lib/jwt"
import { expect, test } from "./fixtures"

/**
 * Wildcard domain from the environment — each server's .env file sets this.
 * Never hardcode a domain here.
 */
const WILDCARD = process.env.NEXT_PUBLIC_PREVIEW_BASE
if (!WILDCARD) {
  throw new Error("NEXT_PUBLIC_PREVIEW_BASE is not set in the test environment. Cannot run TLS check tests.")
}

test.describe("Preview Subdomain Routing", () => {
  /**
   * TLS Check Endpoint — Caddy calls GET /api/tls-check?domain=X before
   * issuing on-demand TLS certificates. Must return 200 for the wildcard
   * domain and any of its subdomains, and reject everything else.
   *
   * Uses NEXT_PUBLIC_PREVIEW_BASE from the env — no hardcoded domains.
   */
  test.describe("TLS check endpoint", () => {
    test("rejects missing domain parameter", async ({ request }) => {
      const response = await request.get("/api/tls-check")
      expect(response.status()).toBe(400)
    })

    test("rejects unrelated domain", async ({ request }) => {
      const response = await request.get("/api/tls-check?domain=evil.example.com")
      expect(response.status()).toBe(403)
    })

    test("approves bare wildcard domain", async ({ request }) => {
      const response = await request.get(`/api/tls-check?domain=${WILDCARD}`)
      expect(response.status()).toBe(200)
    })

    test("approves any subdomain of wildcard", async ({ request }) => {
      const response = await request.get(`/api/tls-check?domain=anything.${WILDCARD}`)
      expect(response.status()).toBe(200)
    })

    test("approves valid preview subdomain", async ({ request }) => {
      const response = await request.get(`/api/tls-check?domain=preview--mysite.${WILDCARD}`)
      expect(response.status()).toBe(200)
    })
  })

  /**
   * Preview Router Authentication — /api/preview-router requires a valid
   * JWT session cookie. These tests hit the endpoint directly to verify
   * the authentication gate works.
   */
  test.describe("preview-router authentication", () => {
    test("returns 401 without auth cookie", async ({ request }) => {
      const response = await request.get("/api/preview-router/", {
        headers: { "x-forwarded-host": `preview--anything.${WILDCARD}` },
      })
      expect(response.status()).toBe(401)
    })

    test("returns 401 with invalid JWT", async ({ request }) => {
      const response = await request.get("/api/preview-router/", {
        headers: {
          "x-forwarded-host": `preview--anything.${WILDCARD}`,
          cookie: `${COOKIE_NAMES.SESSION}=this-is-not-a-valid-jwt`,
        },
      })
      expect(response.status()).toBe(401)
    })

    test("returns 401 with expired JWT", async ({ request }) => {
      const jwtSecret = process.env.JWT_SECRET || TEST_CONFIG.JWT_SECRET
      const expiredToken = jwt.sign(
        {
          role: "authenticated" as const,
          sub: "test-user-id",
          userId: "test-user-id",
          email: "test@example.com",
          name: "Test",
          scopes: DEFAULT_USER_SCOPES,
          orgIds: ["org-test"],
          orgRoles: { "org-test": "owner" as const },
        },
        jwtSecret,
        { expiresIn: "-1h" },
      )

      const response = await request.get("/api/preview-router/", {
        headers: {
          "x-forwarded-host": `preview--anything.${WILDCARD}`,
          cookie: `${COOKIE_NAMES.SESSION}=${expiredToken}`,
        },
      })
      expect(response.status()).toBe(401)
    })
  })
})
