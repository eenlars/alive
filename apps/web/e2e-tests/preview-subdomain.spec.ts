/**
 * Preview Subdomain E2E Tests
 *
 * Tests the preview subdomain infrastructure:
 * 1. TLS check endpoint — Caddy calls this before issuing on-demand certificates
 *
 * Preview proxying is handled by the Go preview-proxy (apps/preview-proxy/).
 * Auth is validated there via JWT preview tokens and HMAC session cookies.
 *
 * Tests are environment-agnostic: they work on local, staging, and production.
 */

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
})
