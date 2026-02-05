import { execSync } from "node:child_process"
import { existsSync, readFileSync, rmSync } from "node:fs"
import { PATHS } from "@webalive/shared"
import { expect, test } from "./fixtures"

// Test domains - using short names to avoid Linux username length limits (32 chars)
// IMPORTANT: Emails MUST use INTERNAL test domains (@alive-playwright.internal)
const TEST_SITES = [
  { slug: "tc1", domain: "tc1.test.local", email: "tc1@alive-playwright.internal" },
  { slug: "tc2", domain: "tc2.test.local", email: "tc2@alive-playwright.internal" },
  { slug: "tc3", domain: "tc3.test.local", email: "tc3@alive-playwright.internal" },
]

const TEST_PASSWORD = "testpass123"

// Validation function for Caddyfile integrity
function validateCaddyfile(expectedDomains: string[]): { valid: boolean; error?: string } {
  if (!existsSync(PATHS.CADDYFILE_PATH)) {
    return { valid: false, error: "Caddyfile not found" }
  }

  const content = readFileSync(PATHS.CADDYFILE_PATH, "utf-8")
  const lines = content.split("\n")

  // Count domain entries
  const domainPattern = /^[a-z0-9.-]+ \{/
  const foundDomains = lines.filter(line => domainPattern.test(line)).map(line => line.split(" ")[0])

  // Check all expected domains are present
  for (const domain of expectedDomains) {
    if (!foundDomains.includes(domain)) {
      return { valid: false, error: `Missing domain: ${domain}` }
    }
  }

  // Count braces
  const openBraces = (content.match(/\{/g) || []).length
  const closeBraces = (content.match(/\}/g) || []).length

  if (openBraces !== closeBraces) {
    return {
      valid: false,
      error: `Mismatched braces: ${openBraces} open, ${closeBraces} close`,
    }
  }

  // Check for incomplete entries (domain without closing brace before next domain)
  // This regex checks if there's a domain followed by another domain without a closing brace
  const incompletePattern = /[a-z0-9.-]+ \{[^}]*\n[a-z0-9.-]+ \{/
  if (incompletePattern.test(content)) {
    return { valid: false, error: "Found incomplete entry (missing closing brace between domains)" }
  }

  return { valid: true }
}

test.describe("Concurrent Deployment - File Locking", () => {
  // Clean up before tests
  test.beforeAll(async () => {
    console.log("[E2E Setup] Cleaning up all test sites")

    for (const site of TEST_SITES) {
      const sitePath = `/srv/webalive/sites/${site.domain}`

      // Remove site directory if exists
      if (existsSync(sitePath)) {
        try {
          rmSync(sitePath, { recursive: true, force: true })
          console.log(`[E2E Setup] Removed: ${sitePath}`)
        } catch (error) {
          console.error(`[E2E Setup] Failed to remove ${sitePath}:`, error)
        }
      }

      // Stop systemd service if running
      try {
        const serviceSlug = site.domain.replace(/\./g, "-")
        execSync(`systemctl stop site@${serviceSlug}.service 2>/dev/null || true`, { stdio: "ignore" })
        console.log(`[E2E Setup] Stopped: site@${serviceSlug}.service`)
      } catch (_error) {
        // Service doesn't exist, that's fine
      }

      // Remove Caddyfile entries (for clean test)
      try {
        // Remove domain block from Caddyfile
        const tempFile = `${PATHS.CADDYFILE_PATH}.tmp`
        execSync(
          `awk '/^${site.domain.replace(/\./g, "\\.")} \\{/,/^\\}/ {next} {print}' ${PATHS.CADDYFILE_PATH} > ${tempFile} && mv ${tempFile} ${PATHS.CADDYFILE_PATH}`,
          { stdio: "ignore" },
        )
        console.log(`[E2E Setup] Removed ${site.domain} from Caddyfile`)
      } catch (_error) {
        // Best effort
      }
    }

    console.log("[E2E Setup] Cleanup complete")
  })

  // Clean up after tests
  test.afterAll(async () => {
    console.log("[E2E Cleanup] Removing all test sites")

    for (const site of TEST_SITES) {
      const sitePath = `/srv/webalive/sites/${site.domain}`

      // Remove site directory
      if (existsSync(sitePath)) {
        try {
          rmSync(sitePath, { recursive: true, force: true })
          console.log(`[E2E Cleanup] Removed: ${sitePath}`)
        } catch (error) {
          console.error(`[E2E Cleanup] Failed to remove ${sitePath}:`, error)
        }
      }

      // Stop and disable systemd service
      try {
        const serviceSlug = site.domain.replace(/\./g, "-")
        execSync(`systemctl stop site@${serviceSlug}.service 2>/dev/null || true`, { stdio: "ignore" })
        execSync(`systemctl disable site@${serviceSlug}.service 2>/dev/null || true`, { stdio: "ignore" })
        console.log(`[E2E Cleanup] Stopped and disabled: site@${serviceSlug}.service`)
      } catch (_error) {
        // Best effort
      }

      // Remove Caddyfile entries
      try {
        const tempFile = `${PATHS.CADDYFILE_PATH}.tmp`
        execSync(
          `awk '/^${site.domain.replace(/\./g, "\\.")} \\{/,/^\\}/ {next} {print}' ${PATHS.CADDYFILE_PATH} > ${tempFile} && mv ${tempFile} ${PATHS.CADDYFILE_PATH}`,
          { stdio: "ignore" },
        )
        console.log(`[E2E Cleanup] Removed ${site.domain} from Caddyfile`)
      } catch (_error) {
        // Best effort
      }
    }

    // Reload Caddy to clean up config
    try {
      execSync("systemctl reload caddy", { stdio: "ignore" })
      console.log("[E2E Cleanup] Reloaded Caddy")
    } catch (_error) {
      // Best effort
    }

    // Clean up database (users, orgs, domains, memberships)
    try {
      const { cleanupTestDatabase } = await import("@/lib/test-helpers/cleanup-test-database")
      await cleanupTestDatabase()
      console.log("[E2E Cleanup] Database cleanup complete")
    } catch (error) {
      console.error("[E2E Cleanup] Database cleanup failed:", error)
      // Don't throw - best effort cleanup
    }

    console.log("[E2E Cleanup] Complete")
  })

  // TODO: Remove this test - moved to integration tests
  test.skip("deploys 3 sites concurrently without Caddyfile corruption", async ({ browser }) => {
    // DEPRECATED: This E2E test has been converted to an integration test
    // Location: features/deployment/__tests__/concurrent-deploy.integration.test.ts
    // Reason: Testing API behavior (file locking), not UI - integration tests are faster and more reliable
    test.setTimeout(180000) // 3 minute timeout for setup + 3 concurrent deployments

    console.log("\n[Test] ========================================")
    console.log("[Test] CONCURRENT DEPLOYMENT TEST - File Locking Validation")
    console.log("[Test] ========================================\n")

    // STEP 1: Create 3 browser contexts (anonymous users)
    console.log("[Test] Step 1: Create 3 browser contexts")
    const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()])
    const pages = await Promise.all(contexts.map(ctx => ctx.newPage()))
    console.log("[Test] ✓ Created 3 browser contexts\n")

    // STEP 2: Navigate all 3 to deploy page
    console.log("[Test] Step 2: Navigate all 3 contexts to /deploy")
    await Promise.all(pages.map(page => page.goto("/deploy")))
    console.log("[Test] ✓ All pages loaded\n")

    // STEP 3: Click Quick Launch on all 3
    console.log("[Test] Step 3: Click Quick Launch on all 3 contexts")
    await Promise.all(
      pages.map(async page => {
        await expect(page.getByTestId("deploy-heading")).toBeVisible()
        await page.getByTestId("mode-option-quick-launch").click()
      }),
    )
    console.log("[Test] ✓ Quick Launch clicked on all\n")

    // STEP 4: Fill forms concurrently (anonymous users - full registration)
    console.log("[Test] Step 4: Fill deployment forms concurrently (anonymous users)")
    await Promise.all(
      pages.map(async (page, i) => {
        const site = TEST_SITES[i]
        await expect(page.getByTestId("slug-input")).toBeVisible({ timeout: 5000 })
        await page.getByTestId("slug-input").fill(site.slug)
        await page.getByTestId("email-input").fill(site.email)
        await page.getByTestId("password-input").fill(TEST_PASSWORD)
        console.log(`[Test] ✓ Filled form for ${site.domain}`)
      }),
    )
    console.log("[Test] ✓ All forms filled\n")

    // STEP 5: Wait for submit button to be enabled (form validation + slug availability)
    console.log("[Test] Step 5: Wait for submit buttons to be enabled")
    await Promise.all(
      pages.map(async (page, i) => {
        const site = TEST_SITES[i]
        // Wait for the submit button to be enabled (not disabled)
        await expect(page.getByTestId("submit-button")).toBeEnabled({ timeout: 10000 })
        console.log(`[Test] ✓ Submit button enabled for ${site.domain}`)
      }),
    )
    console.log("[Test] ✓ All submit buttons ready\n")

    // STEP 6: Verify Caddyfile state BEFORE deployments
    console.log("[Test] Step 6: Verify Caddyfile BEFORE deployments")
    const beforeValidation = validateCaddyfile([])
    expect(beforeValidation.valid).toBe(true)
    console.log("[Test] ✓ Caddyfile valid before deployments\n")

    // STEP 7: Submit all 3 forms AT THE SAME TIME
    console.log("[Test] Step 7: Submit all 3 forms simultaneously")
    const startTime = Date.now()
    const submitPromises = pages.map(page => page.getByTestId("submit-button").click())
    await Promise.all(submitPromises)
    console.log("[Test] ✓ All 3 deployments triggered simultaneously\n")

    // STEP 8: Wait for all deployments to complete (success or error)
    console.log("[Test] Step 8: Wait for all deployments to complete (max 2 minutes)")
    const results = await Promise.all(
      pages.map(async (page, i) => {
        const site = TEST_SITES[i]
        console.log(`[Test]   Waiting for ${site.domain}...`)

        // Wait for either success or error
        const successStatus = page.getByTestId("deployment-status-success")
        const errorStatus = page.getByTestId("deployment-status-error")

        try {
          await Promise.race([
            successStatus.waitFor({ state: "visible", timeout: 100000 }),
            errorStatus.waitFor({ state: "visible", timeout: 100000 }),
          ])

          const _hasSuccess = await successStatus.isVisible()
          const hasError = await errorStatus.isVisible()

          if (hasError) {
            const errorText = await errorStatus.textContent()
            console.log(`[Test]   ❌ ${site.domain} failed: ${errorText}`)
            return { site, success: false, error: errorText }
          }

          console.log(`[Test]   ✓ ${site.domain} succeeded`)
          return { site, success: true }
        } catch (_error) {
          console.log(`[Test]   ❌ ${site.domain} timed out`)
          return { site, success: false, error: "Timeout waiting for deployment result" }
        }
      }),
    )

    const duration = Math.round((Date.now() - startTime) / 1000)
    console.log(`[Test] ✓ All deployments completed in ${duration}s\n`)

    // STEP 9: Verify all deployments succeeded
    console.log("[Test] Step 9: Verify all deployments succeeded")
    const failures = results.filter(r => !r.success)
    if (failures.length > 0) {
      console.log(`[Test] ❌ ${failures.length} deployment(s) failed:`)
      for (const failure of failures) {
        console.log(`[Test]   - ${failure.site.domain}: ${failure.error}`)
      }
      throw new Error(`${failures.length} deployment(s) failed`)
    }
    console.log("[Test] ✓ All 3 deployments succeeded\n")

    // STEP 10: Validate Caddyfile integrity
    console.log("[Test] Step 10: CRITICAL - Validate Caddyfile integrity")
    const afterValidation = validateCaddyfile(TEST_SITES.map(s => s.domain))

    if (!afterValidation.valid) {
      console.log(`[Test] ❌ CADDYFILE CORRUPTED: ${afterValidation.error}`)
      console.log("\n[Test] Caddyfile content (showing test domains only):")

      const content = readFileSync(PATHS.CADDYFILE_PATH, "utf-8")
      const testDomainPattern = /tc\d+\.alive\.best/
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

      console.log(relevantLines.join("\n"))
      throw new Error(`Caddyfile validation failed: ${afterValidation.error}`)
    }

    console.log("[Test] ✓ Caddyfile integrity verified:")
    console.log(`[Test]   - All ${TEST_SITES.length} domains present`)
    console.log("[Test]   - Braces balanced")
    console.log("[Test]   - No incomplete entries")
    console.log("[Test]   - No corruption detected\n")

    // STEP 11: Verify systemd services are running
    console.log("[Test] Step 11: Verify all systemd services are running")
    for (const site of TEST_SITES) {
      try {
        const serviceSlug = site.domain.replace(/\./g, "-")
        const serviceName = `site@${serviceSlug}.service`
        const status = execSync(`systemctl is-active ${serviceName}`, { encoding: "utf-8" }).trim()
        expect(status).toBe("active")
        console.log(`[Test] ✓ Service active: ${serviceName}`)
      } catch (error) {
        throw new Error(`Service check failed for ${site.domain}: ${error}`)
      }
    }
    console.log("")

    // STEP 12: Verify site directories exist
    console.log("[Test] Step 12: Verify all site directories exist")
    for (const site of TEST_SITES) {
      const sitePath = `/srv/webalive/sites/${site.domain}`
      expect(existsSync(sitePath)).toBe(true)
      console.log(`[Test] ✓ Directory exists: ${sitePath}`)
    }
    console.log("")

    // Clean up browser contexts
    await Promise.all(contexts.map(ctx => ctx.close()))

    console.log("[Test] ========================================")
    console.log("[Test] ✅ CONCURRENT DEPLOYMENT TEST PASSED")
    console.log("[Test] ========================================")
    console.log(`[Test] - Deployed ${TEST_SITES.length} sites simultaneously`)
    console.log(`[Test] - Total time: ${duration}s`)
    console.log("[Test] - File locking prevented Caddyfile corruption")
    console.log("[Test] - All services running")
    console.log("[Test] - All directories created")
    console.log("[Test] ========================================\n")
  })
})
