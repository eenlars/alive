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
 * - Manual curl: curl -H "Host: preview--x.sonno.tech" http://localhost:9000/
 *
 * Tests are environment-agnostic: they work on local, staging, and production.
 */

import { COOKIE_NAMES, TEST_CONFIG } from "@webalive/shared"
import jwt from "jsonwebtoken"
import { expect, test } from "./fixtures"

test.describe("Preview Subdomain Routing", () => {
  /**
   * TLS Check Endpoint — Caddy calls GET /api/tls-check?domain=X before
   * issuing on-demand TLS certificates. Must return 200 for valid preview
   * subdomains and reject everything else.
   */
  test.describe("TLS check endpoint", () => {
    test("rejects missing domain parameter", async ({ request }) => {
      const response = await request.get("/api/tls-check")
      expect(response.status()).toBe(400)
    })

    test("rejects non-preview domain", async ({ request }) => {
      const response = await request.get("/api/tls-check?domain=evil.example.com")
      expect(response.status()).toBe(403)
    })

    test("rejects bare top-level domain", async ({ request }) => {
      const response = await request.get("/api/tls-check?domain=sonno.tech")
      expect(response.status()).toBe(403)
    })

    test("rejects preview prefix without label", async ({ request }) => {
      const response = await request.get("/api/tls-check?domain=preview--.sonno.tech")
      expect(response.status()).toBe(403)
    })

    test("approves valid preview subdomain", async ({ request }) => {
      // Try known wildcard domains to handle different environments
      const candidates = ["sonno.tech", "test.local", "alive.best"]
      let approved = false

      for (const wildcard of candidates) {
        const label = `mysite-${wildcard.replace(/\./g, "-")}`
        const domain = `preview--${label}.${wildcard}`
        const response = await request.get(`/api/tls-check?domain=${domain}`)
        if (response.status() === 200) {
          approved = true
          break
        }
      }

      expect(approved).toBe(true)
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
        headers: { "x-forwarded-host": "preview--anything.sonno.tech" },
      })
      expect(response.status()).toBe(401)
    })

    test("returns 401 with invalid JWT", async ({ request }) => {
      const response = await request.get("/api/preview-router/", {
        headers: {
          "x-forwarded-host": "preview--anything.sonno.tech",
          cookie: `${COOKIE_NAMES.SESSION}=this-is-not-a-valid-jwt`,
        },
      })
      expect(response.status()).toBe(401)
    })

    test("returns 401 with expired JWT", async ({ request }) => {
      const jwtSecret = process.env.JWT_SECRET || TEST_CONFIG.JWT_SECRET
      const expiredToken = jwt.sign(
        {
          sub: "test-user-id",
          userId: "test-user-id",
          email: "test@example.com",
          name: "Test",
          workspaces: [],
        },
        jwtSecret,
        { expiresIn: "-1h" },
      )

      const response = await request.get("/api/preview-router/", {
        headers: {
          "x-forwarded-host": "preview--anything.sonno.tech",
          cookie: `${COOKIE_NAMES.SESSION}=${expiredToken}`,
        },
      })
      expect(response.status()).toBe(401)
    })
  })
})
