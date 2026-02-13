/**
 * Templates Health Check E2E Test
 *
 * Verifies that all active deployment templates are accessible.
 * Fetches templates dynamically from the API (not hardcoded).
 */

import { expect, test } from "./fixtures"

interface Template {
  template_id: string
  name: string
  description: string | null
  preview_url: string
  image_url: string | null
  deploy_count: number
  is_active: boolean
  ai_description: string | null
}

interface TemplatesResponse {
  templates: Template[]
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
} as const

async function tryFetch(url: string, headers?: Record<string, string>) {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
      headers,
    })
    return { status: response.status, ok: response.status >= 200 && response.status < 400 }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return { status: errorMessage, ok: false }
  }
}

test.describe("Template Sites Health", () => {
  test("all active templates are accessible", async ({ baseURL, page }) => {
    // Fetch templates from the API
    const apiUrl = baseURL || "http://localhost:8997"
    const response = await fetch(`${apiUrl}/api/templates`)

    expect(response.ok).toBe(true)

    const data: TemplatesResponse = await response.json()
    expect(data.templates).toBeDefined()
    expect(Array.isArray(data.templates)).toBe(true)
    expect(data.templates.length).toBeGreaterThan(0)

    console.log(`Found ${data.templates.length} active templates to check`)

    // Check each template site is accessible
    const results: { name: string; url: string; status: number | string; ok: boolean }[] = []

    for (const template of data.templates) {
      const templateUrl = template.preview_url

      try {
        // First try direct fetch (fast path)
        let { status, ok } = await tryFetch(templateUrl)

        // If blocked by bot protection, retry with browser-like headers
        if (!ok) {
          const browserAttempt = await tryFetch(templateUrl, { ...BROWSER_HEADERS })
          status = browserAttempt.status
          ok = browserAttempt.ok
        }

        // Final fallback: use real browser navigation (most accurate)
        if (!ok) {
          const response = await page.goto(templateUrl, { waitUntil: "domcontentloaded", timeout: 10000 })
          if (response) {
            status = response.status()
            ok = status >= 200 && status < 400
          } else {
            status = "No response"
            ok = false
          }
        }

        // 200-399 are acceptable (includes redirects)
        results.push({
          name: template.name,
          url: templateUrl,
          status,
          ok,
        })

        console.log(`  ${ok ? "✓" : "✗"} ${template.name} (${templateUrl}): ${status}`)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"
        results.push({
          name: template.name,
          url: templateUrl,
          status: errorMessage,
          ok: false,
        })
        console.log(`  ✗ ${template.name} (${templateUrl}): ${errorMessage}`)
      }
    }

    // All templates should be accessible
    const failedTemplates = results.filter(r => !r.ok)

    if (failedTemplates.length > 0) {
      const failureDetails = failedTemplates.map(f => `${f.name} (${f.url}): ${f.status}`).join("\n  ")
      throw new Error(`${failedTemplates.length} template site(s) are not accessible:\n  ${failureDetails}`)
    }

    expect(failedTemplates).toHaveLength(0)
  })

  test("templates API returns expected fields", async ({ baseURL }) => {
    const apiUrl = baseURL || "http://localhost:8997"
    const response = await fetch(`${apiUrl}/api/templates`)

    expect(response.ok).toBe(true)

    const data: TemplatesResponse = await response.json()

    // Verify each template has required fields
    for (const template of data.templates) {
      expect(template.template_id).toBeDefined()
      expect(typeof template.template_id).toBe("string")

      expect(template.preview_url).toBeDefined()
      expect(typeof template.preview_url).toBe("string")
      expect(template.preview_url).toMatch(/^https?:\/\//) // Valid URL

      expect(template.name).toBeDefined()
      expect(typeof template.name).toBe("string")

      expect(template.is_active).toBe(true) // API only returns active templates

      expect(typeof template.deploy_count).toBe("number")
    }
  })
})
