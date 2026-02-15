/**
 * Playwright Global Setup - Bootstrap Worker Tenants
 *
 * Creates isolated tenant for each worker before tests run.
 */

import type { FullConfig } from "@playwright/test"
import { TEST_CONFIG } from "@webalive/shared"
import { requireProjectBaseUrl } from "./lib/base-url"

function resolveBaseUrl(config: FullConfig): string {
  const projectBaseUrl = config.projects[0]?.use?.baseURL
  return requireProjectBaseUrl(projectBaseUrl)
}

/**
 * Warm up critical pages to trigger Next.js compilation before parallel tests start
 * This prevents multiple workers from all waiting for initial compilation simultaneously
 */
async function warmupServer(baseUrl: string): Promise<void> {
  const criticalPages = ["/", "/chat", "/deploy"]
  console.log("🔥 [Global Setup] Warming up server pages...")

  for (const page of criticalPages) {
    try {
      const start = Date.now()
      await fetch(`${baseUrl}${page}`, { method: "GET" })
      console.log(`   ✓ ${page} (${Date.now() - start}ms)`)
    } catch (error) {
      console.log(`   ⚠ ${page} warmup failed: ${error}`)
    }
  }
}

/**
 * Poll for tenant readiness with exponential backoff
 * Replaces arbitrary 2-second delay with explicit ready checks
 */
async function verifyTenantReadiness(baseUrl: string, workers: number): Promise<void> {
  const maxAttempts = 20 // 20 attempts at 200ms = 4s max
  const delayMs = 200

  // Get test secret for staging/production E2E tests
  const testSecret = process.env.E2E_TEST_SECRET
  const headers: Record<string, string> = {}
  if (testSecret) {
    headers["x-test-secret"] = testSecret
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const results = await Promise.all(
      Array.from({ length: workers }).map(async (_, idx) => {
        const email = `${TEST_CONFIG.WORKER_EMAIL_PREFIX}${idx}@${TEST_CONFIG.EMAIL_DOMAIN}`
        try {
          const res = await fetch(`${baseUrl}/api/test/verify-tenant?email=${encodeURIComponent(email)}`, { headers })
          const data = await res.json()
          return data.ready === true
        } catch {
          return false
        }
      }),
    )

    const allReady = results.every(Boolean)
    if (allReady) {
      console.log(`   ✓ All tenants ready (verified in ${attempt * delayMs}ms)`)
      return
    }

    // Log progress every 5 attempts
    if (attempt % 5 === 0) {
      const readyCount = results.filter(Boolean).length
      console.log(`   ⏱ Attempt ${attempt}/${maxAttempts}: ${readyCount}/${workers} tenants ready`)
    }

    await new Promise(resolve => setTimeout(resolve, delayMs))
  }

  throw new Error(`Tenant verification timeout after ${maxAttempts * delayMs}ms. Database consistency issue detected.`)
}

export default async function globalSetup(config: FullConfig) {
  const runId = `E2E_${new Date().toISOString()}`
  process.env.E2E_RUN_ID = runId

  // In multi-port mode, each project is a separate "worker"
  // In single-server mode, workers share one server
  const isMultiPort = config.projects.length > 1 && config.projects.every(p => p.use?.baseURL)
  const workers = isMultiPort ? config.projects.length : (config.workers ?? 4)

  const baseUrl = resolveBaseUrl(config)

  console.log(`\n🚀 [Global Setup] Bootstrapping ${workers} worker tenants`)
  console.log(`📝 [Global Setup] Run ID: ${runId}`)
  console.log(`🔧 [Global Setup] Mode: ${isMultiPort ? "multi-port" : "single-server"}\n`)

  // Get test secret for staging/production E2E tests
  const testSecret = process.env.E2E_TEST_SECRET
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (testSecret) {
    headers["x-test-secret"] = testSecret
  }

  try {
    await Promise.all(
      Array.from({ length: workers }).map(async (_, i) => {
        const email = `${TEST_CONFIG.WORKER_EMAIL_PREFIX}${i}@${TEST_CONFIG.EMAIL_DOMAIN}`
        const workspace = `${TEST_CONFIG.WORKSPACE_PREFIX}${i}.${TEST_CONFIG.EMAIL_DOMAIN}`

        const res = await fetch(`${baseUrl}/api/test/bootstrap-tenant`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            runId,
            workerIndex: i,
            email,
            workspace,
            credits: TEST_CONFIG.DEFAULT_CREDITS,
          }),
        })

        // Check if response is JSON before parsing
        const contentType = res.headers.get("content-type")
        if (!contentType?.includes("application/json")) {
          const text = await res.text()
          throw new Error(
            `Worker ${i} bootstrap failed: Expected JSON, got ${contentType || "unknown"}. ` +
              `Status: ${res.status}. Response: ${text.substring(0, 200)}`,
          )
        }

        const data = await res.json()

        if (!data.ok) {
          throw new Error(`Worker ${i} bootstrap failed: ${data.error}`)
        }

        console.log(`✓ Worker ${i}: ${email}`)
      }),
    )

    console.log("\n✅ [Global Setup] All tenants created\n")

    // Poll for tenant readiness instead of fixed delay
    console.log("⏳ Verifying tenant readiness...")
    await verifyTenantReadiness(baseUrl, workers)
    console.log("✅ All tenants verified\n")

    // Warm up critical pages before parallel tests start
    // This ensures Next.js has compiled all pages that tests will hit
    await warmupServer(baseUrl)
  } catch (error) {
    console.error("\n❌ [Global Setup] Failed:", error)
    throw error
  }
}
