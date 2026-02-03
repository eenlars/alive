/**
 * Integration Test: Concurrent Deployment File Locking
 *
 * Tests that multiple concurrent deployments don't corrupt the Caddyfile
 * through proper file locking mechanisms.
 *
 * This is an INTEGRATION test (not E2E) because:
 * - Tests API behavior, not UI
 * - Focuses on file locking mechanism
 * - Faster, more reliable, easier to debug
 *
 * NOTE: Skipped during unit test runs - requires full Supabase permissions.
 * Run with E2E tests instead where proper credentials are configured.
 */

import { execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { COOKIE_NAMES, environments, PATHS, TEST_CONFIG } from "@webalive/shared"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createTestUser } from "@/lib/test-helpers/auth-test-helper"
import { assertSupabaseServiceEnv, assertSystemTestEnv } from "@/lib/test-helpers/integration-env"

const BASE_URL = `http://localhost:${environments.production.port}`

interface TestSite {
  slug: string
  domain: string
  user: {
    userId: string
    email: string
    orgId: string
    orgName: string
  }
  sessionCookie: string
}

// Test domains - short slugs to avoid Linux username limits
const TEST_SLUGS = ["cd1", "cd2", "cd3"] // cd = concurrent deploy
const SUITE_NAME = "Concurrent Deployment - File Locking"

assertSystemTestEnv()
assertSupabaseServiceEnv()

/**
 * Validate Caddyfile integrity
 * Checks for:
 * - Balanced braces
 * - All expected domains present
 * - No incomplete entries
 */
function validateCaddyfile(expectedDomains: string[]): { valid: boolean; error?: string } {
  if (!existsSync(PATHS.CADDYFILE_PATH)) {
    return { valid: false, error: "Caddyfile not found" }
  }

  const content = readFileSync(PATHS.CADDYFILE_PATH, "utf-8")

  // Count braces
  const openBraces = (content.match(/\{/g) || []).length
  const closeBraces = (content.match(/\}/g) || []).length

  if (openBraces !== closeBraces) {
    return {
      valid: false,
      error: `Mismatched braces: ${openBraces} open, ${closeBraces} close`,
    }
  }

  // Check all expected domains are present
  for (const domain of expectedDomains) {
    const domainRegex = new RegExp(`^${domain.replace(/\./g, "\\.")} \\{`, "m")
    if (!domainRegex.test(content)) {
      return { valid: false, error: `Missing domain: ${domain}` }
    }
  }

  // Check for incomplete entries (domain without closing brace before next domain)
  const incompletePattern = /[a-z0-9.-]+ \{[^}]*\n[a-z0-9.-]+ \{/
  if (incompletePattern.test(content)) {
    return { valid: false, error: "Found incomplete entry (missing closing brace between domains)" }
  }

  return { valid: true }
}

/**
 * Clean up deployed test sites
 */
async function cleanupTestSite(domain: string): Promise<void> {
  const serviceSlug = domain.replace(/\./g, "-")

  // Stop and disable systemd service
  try {
    execSync(`systemctl stop site@${serviceSlug}.service 2>/dev/null || true`, { stdio: "ignore" })
    execSync(`systemctl disable site@${serviceSlug}.service 2>/dev/null || true`, { stdio: "ignore" })
  } catch {
    // Best effort
  }

  // Remove from Caddyfile
  try {
    const tempFile = `${PATHS.CADDYFILE_PATH}.tmp`
    execSync(
      `awk '/^${domain.replace(/\./g, "\\.")} \\{/,/^\\}/ {next} {print}' ${PATHS.CADDYFILE_PATH} > ${tempFile} && mv ${tempFile} ${PATHS.CADDYFILE_PATH}`,
      { stdio: "ignore" },
    )
  } catch {
    // Best effort
  }

  // Remove site directory
  try {
    execSync(`rm -rf /srv/webalive/sites/${domain}`, { stdio: "ignore" })
  } catch {
    // Best effort
  }
}

/**
 * Create authenticated session for test user
 */
async function createAuthSession(email: string, password: string): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status}`)
  }

  // Extract session cookie
  const setCookie = response.headers.get("set-cookie")
  if (!setCookie) {
    throw new Error("No session cookie returned")
  }

  // Parse cookie (format: "auth_session=token; Path=/; HttpOnly")
  const cookiePattern = new RegExp(`${COOKIE_NAMES.SESSION}=([^;]+)`)
  const match = setCookie.match(cookiePattern)
  if (!match) {
    throw new Error("Failed to parse session cookie")
  }

  return `${COOKIE_NAMES.SESSION}=${match[1]}`
}

describe(SUITE_NAME, () => {
  let testSites: TestSite[] = []

  beforeAll(async () => {
    console.log("[Integration Test] Setting up 3 test users...")

    // Create test users with organizations
    const users = await Promise.all(
      TEST_SLUGS.map(async slug => {
        const email = `${slug}@bridge-vitest.internal`
        const password = TEST_CONFIG.TEST_PASSWORD
        const user = await createTestUser(email, TEST_CONFIG.DEFAULT_CREDITS, password)

        // Get session cookie
        const sessionCookie = await createAuthSession(email, password)

        return {
          slug,
          domain: `${slug}.alive.best`,
          user,
          sessionCookie,
        }
      }),
    )

    testSites = users
    console.log(`[Integration Test] Created ${testSites.length} test users`)
  })

  afterAll(async () => {
    console.log("[Integration Test] Cleaning up test sites...")

    // Clean up deployed sites
    await Promise.all(testSites.map(site => cleanupTestSite(site.domain)))

    // Reload Caddy
    try {
      execSync("systemctl reload caddy", { stdio: "ignore" })
    } catch {
      // Best effort
    }

    // Clean up test users via database cleanup
    try {
      const { cleanupTestDatabase } = await import("@/lib/test-helpers/cleanup-test-database")
      await cleanupTestDatabase()
      console.log("[Integration Test] Cleanup complete")
    } catch (error) {
      console.error("[Integration Test] Cleanup error:", error)
    }
  })

  test("deploys 3 sites concurrently without Caddyfile corruption", async () => {
    console.log("\n[Integration Test] Starting concurrent deployment test...")

    // Verify Caddyfile is valid BEFORE deployments
    const beforeValidation = validateCaddyfile([])
    expect(beforeValidation.valid).toBe(true)
    console.log("[Integration Test] ✓ Caddyfile valid before deployments")

    // Deploy all 3 sites SIMULTANEOUSLY
    console.log("[Integration Test] Deploying 3 sites concurrently...")
    const startTime = Date.now()

    const deploymentPromises = testSites.map(async site => {
      const response = await fetch(`${BASE_URL}/api/deploy-subdomain`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: site.sessionCookie,
        },
        body: JSON.stringify({
          slug: site.slug,
          siteIdeas: "Test site for concurrent deployment testing",
          templateId: TEST_CONFIG.DEFAULT_TEMPLATE_ID,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        console.error(`[Integration Test] Deployment failed for ${site.domain}:`, data)
        return { site, success: false, error: data.message || "Unknown error", data }
      }

      console.log(`[Integration Test] ✓ Deployed ${site.domain}`)
      return { site, success: true, data }
    })

    const results = await Promise.all(deploymentPromises)
    const duration = Math.round((Date.now() - startTime) / 1000)

    console.log(`[Integration Test] All deployments completed in ${duration}s`)

    // Verify all deployments succeeded
    const failures = results.filter(r => !r.success)
    if (failures.length > 0) {
      console.error("[Integration Test] Deployment failures:")
      for (const failure of failures) {
        console.error(`  - ${failure.site.domain}: ${failure.error}`)
      }
    }

    expect(failures).toHaveLength(0)
    console.log("[Integration Test] ✓ All 3 deployments succeeded")

    // CRITICAL: Validate Caddyfile integrity after concurrent writes
    console.log("[Integration Test] Validating Caddyfile integrity...")
    const afterValidation = validateCaddyfile(testSites.map(s => s.domain))

    if (!afterValidation.valid) {
      console.error(`[Integration Test] ❌ CADDYFILE CORRUPTED: ${afterValidation.error}`)

      // Show affected domains in Caddyfile
      const content = readFileSync(PATHS.CADDYFILE_PATH, "utf-8")
      const testDomainPattern = new RegExp(`(${TEST_SLUGS.join("|")})\\.alive\\.best`)
      const lines = content.split("\n")
      const relevantLines = []
      let inTestBlock = false

      for (let i = 0; i < lines.length; i++) {
        if (testDomainPattern.test(lines[i])) {
          inTestBlock = true
        }
        if (inTestBlock) {
          relevantLines.push(`${i + 1}: ${lines[i]}`)
        }
        if (inTestBlock && lines[i].trim() === "}") {
          inTestBlock = false
        }
      }

      console.error("[Integration Test] Caddyfile content (test domains):")
      console.error(relevantLines.join("\n"))
    }

    expect(afterValidation.valid).toBe(true)
    console.log("[Integration Test] ✓ Caddyfile integrity verified:")
    console.log(`[Integration Test]   - All ${testSites.length} domains present`)
    console.log("[Integration Test]   - Braces balanced")
    console.log("[Integration Test]   - No incomplete entries")
    console.log("[Integration Test]   - No corruption detected")

    // Verify systemd services are running
    console.log("[Integration Test] Verifying systemd services...")
    for (const site of testSites) {
      const serviceSlug = site.domain.replace(/\./g, "-")
      const serviceName = `site@${serviceSlug}.service`

      const status = execSync(`systemctl is-active ${serviceName}`, { encoding: "utf-8" }).trim()
      expect(status).toBe("active")
      console.log(`[Integration Test] ✓ Service active: ${serviceName}`)
    }

    // Verify site directories exist
    console.log("[Integration Test] Verifying site directories...")
    for (const site of testSites) {
      const sitePath = `/srv/webalive/sites/${site.domain}`
      expect(existsSync(sitePath)).toBe(true)
      console.log(`[Integration Test] ✓ Directory exists: ${sitePath}`)
    }

    console.log("\n[Integration Test] ========================================")
    console.log("[Integration Test] ✅ CONCURRENT DEPLOYMENT TEST PASSED")
    console.log("[Integration Test] ========================================")
    console.log(`[Integration Test] - Deployed ${testSites.length} sites simultaneously`)
    console.log(`[Integration Test] - Total time: ${duration}s`)
    console.log("[Integration Test] - File locking prevented Caddyfile corruption")
    console.log("[Integration Test] - All services running")
    console.log("[Integration Test] - All directories created")
    console.log("[Integration Test] ========================================\n")
  }, 180000) // 3 minute timeout
})
