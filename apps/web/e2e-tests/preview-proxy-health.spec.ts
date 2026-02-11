/**
 * Preview Proxy Health E2E Tests
 *
 * Tests that the Go preview proxy correctly serves site previews:
 * 1. Authentication — JWT token → session cookie flow
 * 2. HTML serving — proxied site returns actual content
 * 3. Image serving — /_images/* returns images, not SPA fallback
 * 4. Sub-resource auth — session cookie authenticates CSS/JS/image requests
 *
 * These tests hit REAL infrastructure (Go proxy, Caddy, running sites).
 * They only run on staging/production — skipped on local (no Go proxy).
 *
 * Run: ENV_FILE=.env.staging bun run test:e2e
 */

import jwt from "jsonwebtoken"
import { expect, test } from "./fixtures"
import { isLocalTestServer } from "./lib/test-env"

const PREVIEW_BASE = process.env.NEXT_PUBLIC_PREVIEW_BASE
if (!PREVIEW_BASE) {
  throw new Error("NEXT_PUBLIC_PREVIEW_BASE is not set. Cannot run preview proxy tests.")
}

/**
 * Convert a domain (e.g. "blank.alive.best") to preview subdomain label.
 * "blank.alive.best" → "blank-alive-best"
 */
function toPreviewLabel(domain: string): string {
  return domain.split(".").join("-")
}

/**
 * Build the preview proxy URL for a given domain.
 * e.g. "blank.alive.best" → "https://preview--blank-alive-best.alive.best"
 */
function previewUrl(domain: string, path = "/"): string {
  const label = toPreviewLabel(domain)
  return `https://preview--${label}.${PREVIEW_BASE}${path}`
}

// Skip all preview proxy tests on local — no Go proxy running
const describeProxy = isLocalTestServer ? test.describe.skip : test.describe

describeProxy("Preview Proxy Health", () => {
  // Use JWT_SECRET to create preview tokens directly (no app auth needed)
  // Safe to access here — this describe block is skipped on local (no Go proxy)
  const jwtSecret = process.env.JWT_SECRET || ""

  /**
   * Create a preview token (same format the app's /api/auth/preview-token generates)
   */
  function createPreviewToken(expiresIn: jwt.SignOptions["expiresIn"] = "5m"): string {
    if (!jwtSecret) throw new Error("JWT_SECRET is not set")
    return jwt.sign({ type: "preview", userId: "e2e-test-user", iat: Math.floor(Date.now() / 1000) }, jwtSecret, {
      expiresIn,
    })
  }

  /**
   * Fetch a list of active template sites from the API.
   * Only returns templates whose preview_url is on the current server
   * (hostname ends with PREVIEW_BASE). Templates on other servers
   * are unreachable through the local preview proxy.
   */
  async function getTemplateSites(baseURL: string): Promise<string[]> {
    try {
      const res = await fetch(`${baseURL}/api/templates`)
      if (!res.ok) return []
      const data = await res.json()
      // Extract domain from preview_url (e.g. "https://blank.alive.best" → "blank.alive.best")
      // and filter to only include sites on the current server
      return (data.templates || [])
        .filter((t: { is_active: boolean }) => t.is_active)
        .map((t: { preview_url: string }) => {
          try {
            return new URL(t.preview_url).hostname
          } catch {
            return null
          }
        })
        .filter((hostname: string | null): hostname is string => {
          if (!hostname) return false
          // Only include templates routable through this server's preview proxy
          return hostname.endsWith(`.${PREVIEW_BASE}`) || hostname === PREVIEW_BASE
        })
    } catch {
      return []
    }
  }

  test.describe("Authentication", () => {
    test("rejects request without preview_token", async () => {
      const url = previewUrl(`blank.${PREVIEW_BASE}`)
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10000) })
      expect(res.status).toBe(401)
    })

    test("rejects request with expired token", async () => {
      const expiredToken = createPreviewToken("-1h")
      const url = previewUrl(`blank.${PREVIEW_BASE}`, `/?preview_token=${expiredToken}`)
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10000) })
      expect(res.status).toBe(401)
    })

    test("rejects request with invalid token", async () => {
      const url = previewUrl(`blank.${PREVIEW_BASE}`, "/?preview_token=not-a-valid-jwt")
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10000) })
      expect(res.status).toBe(401)
    })

    test("accepts request with valid token and sets session cookie", async () => {
      const token = createPreviewToken()
      const url = previewUrl(`blank.${PREVIEW_BASE}`, `/?preview_token=${token}`)
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15000) })

      // Should succeed (200 or redirect, not 401)
      expect(res.status).not.toBe(401)

      // Should set the __alive_preview session cookie
      const setCookie = res.headers.get("set-cookie")
      expect(setCookie).toBeTruthy()
      expect(setCookie).toContain("__alive_preview")
      expect(setCookie).toContain("HttpOnly")
      expect(setCookie).toContain("Secure")
    })
  })

  test.describe("HTML Serving", () => {
    test("returns HTML for template site preview", async ({ baseURL }) => {
      const apiBase = baseURL || "http://localhost:8998"
      const sites = await getTemplateSites(apiBase)

      // Need at least one template site to test
      test.skip(sites.length === 0, "No active template sites found")

      const domain = sites[0]
      const token = createPreviewToken()
      const url = previewUrl(domain, `/?preview_token=${token}`)

      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000) })

      expect(res.status).toBe(200)
      const contentType = res.headers.get("content-type") || ""
      expect(contentType).toContain("text/html")

      // Should contain actual HTML content
      const body = await res.text()
      expect(body).toContain("<html")
      expect(body.length).toBeGreaterThan(100)

      // Should NOT have X-Frame-Options (proxy strips it for iframe embedding)
      expect(res.headers.get("x-frame-options")).toBeNull()

      console.log(`  ✓ ${domain}: ${body.length} bytes HTML`)
    })

    test("injects navigation sync script into HTML", async ({ baseURL }) => {
      const apiBase = baseURL || "http://localhost:8998"
      const sites = await getTemplateSites(apiBase)
      test.skip(sites.length === 0, "No active template sites found")

      const domain = sites[0]
      const token = createPreviewToken()
      const url = previewUrl(domain, `/?preview_token=${token}`)

      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000) })
      expect(res.status).toBe(200)

      const body = await res.text()
      // The Go proxy injects a script that posts navigation messages
      // Must contain the preview-navigation message type (from @webalive/shared PREVIEW_MESSAGES)
      expect(body).toContain("preview-navigation")

      console.log(`  ✓ ${domain}: nav script injected`)
    })

    test("sets frame-ancestors CSP header", async ({ baseURL }) => {
      const apiBase = baseURL || "http://localhost:8998"
      const sites = await getTemplateSites(apiBase)
      test.skip(sites.length === 0, "No active template sites found")

      const domain = sites[0]
      const token = createPreviewToken()
      const url = previewUrl(domain, `/?preview_token=${token}`)

      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000) })
      expect(res.status).toBe(200)

      const csp = res.headers.get("content-security-policy")
      expect(csp).toBeTruthy()
      expect(csp).toContain("frame-ancestors")

      console.log(`  ✓ CSP: ${csp}`)
    })
  })

  test.describe("Sub-resource Auth (Cookie)", () => {
    test("session cookie authenticates sub-resource requests", async ({ baseURL }) => {
      const apiBase = baseURL || "http://localhost:8998"
      const sites = await getTemplateSites(apiBase)
      test.skip(sites.length === 0, "No active template sites found")

      const domain = sites[0]
      const token = createPreviewToken()

      // Step 1: Initial request with token → get session cookie
      const initialUrl = previewUrl(domain, `/?preview_token=${token}`)
      const initialRes = await fetch(initialUrl, { redirect: "manual", signal: AbortSignal.timeout(15000) })
      expect(initialRes.status).not.toBe(401)

      const setCookieHeader = initialRes.headers.get("set-cookie")
      expect(setCookieHeader).toBeTruthy()

      // Extract cookie value
      const cookieMatch = setCookieHeader!.match(/__alive_preview=([^;]+)/)
      expect(cookieMatch).toBeTruthy()
      const cookieValue = cookieMatch![1]

      // Step 2: Sub-resource request with cookie only (no token)
      const subResourceUrl = previewUrl(domain, "/favicon.ico")
      const subRes = await fetch(subResourceUrl, {
        headers: { cookie: `__alive_preview=${cookieValue}` },
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      })

      // Should succeed (not 401) — the cookie authenticates the request
      expect(subRes.status).not.toBe(401)

      console.log(`  ✓ Cookie auth works for sub-resources (status: ${subRes.status})`)
    })
  })

  test.describe("Image Serving", () => {
    /**
     * This test verifies that /_images/* requests through the preview proxy
     * return actual image content, not the SPA's index.html fallback.
     *
     * Currently FAILS: the Go proxy forwards /_images/* to the site backend
     * which returns text/html. Fix tracked in GitHub issue #68.
     */
    test.fixme("/_images/* returns image content, not HTML", async ({ baseURL }) => {
      const apiBase = baseURL || "http://localhost:8998"
      const sites = await getTemplateSites(apiBase)
      test.skip(sites.length === 0, "No active template sites found")

      // Find a site that has images by checking a known template
      // The image path includes the domain: /_images/t/{domain}/o/{hash}/v/orig.webp
      const domain = sites[0]
      const token = createPreviewToken()

      // First get the session cookie
      const initialUrl = previewUrl(domain, `/?preview_token=${token}`)
      const initialRes = await fetch(initialUrl, { redirect: "manual", signal: AbortSignal.timeout(15000) })
      const setCookieHeader = initialRes.headers.get("set-cookie")
      const cookieMatch = setCookieHeader?.match(/__alive_preview=([^;]+)/)

      test.skip(!cookieMatch, "Could not get session cookie")

      const cookieValue = cookieMatch![1]

      // Try to fetch an image through the preview proxy
      // Use the storage listing approach: check if any images exist for this domain
      const imageCheckUrl = previewUrl(domain, `/_images/t/${domain}/`)
      const imageRes = await fetch(imageCheckUrl, {
        headers: { cookie: `__alive_preview=${cookieValue}` },
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      })

      // The critical check: if the response is text/html, the proxy is
      // forwarding to the site backend instead of serving from storage
      const contentType = imageRes.headers.get("content-type") || ""
      expect(contentType).not.toContain("text/html")

      console.log(`  Image path content-type: ${contentType} (status: ${imageRes.status})`)
    })
  })

  test.describe("Health Endpoint", () => {
    test("Go proxy health check responds", async () => {
      // The health endpoint doesn't require a preview subdomain host
      // but it does need to reach the proxy. Use a preview URL.
      const url = previewUrl(`health-check.${PREVIEW_BASE}`, "/health")
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
        // Health endpoint returns 200 even without auth
        // But it might return 400 "Invalid preview host" — that's also fine (proxy is alive)
        expect([200, 400, 401]).toContain(res.status)
        console.log(`  ✓ Proxy responding (status: ${res.status})`)
      } catch (error) {
        // If we can't reach the proxy at all, that's a real failure
        throw new Error(`Preview proxy is not reachable: ${error}`)
      }
    })
  })
})
