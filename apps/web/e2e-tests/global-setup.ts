/**
 * Playwright Global Setup - Bootstrap Worker Tenants
 *
 * Creates isolated tenant for each worker before tests run.
 */

import type { FullConfig } from "@playwright/test"
import { TEST_CONFIG } from "@webalive/shared"
import { requireProjectBaseUrl } from "./lib/base-url"

const TENANT_VERIFY_TIMEOUT_MS = 30_000
const TENANT_VERIFY_REQUEST_TIMEOUT_MS = 8_000
const TENANT_VERIFY_INITIAL_DELAY_MS = 200
const TENANT_VERIFY_MAX_DELAY_MS = 2_000
const TENANT_VERIFY_LOG_EVERY_ATTEMPTS = 3

function resolveBaseUrl(config: FullConfig): string {
  const projectBaseUrl = config.projects[0]?.use?.baseURL
  return requireProjectBaseUrl(projectBaseUrl)
}

interface TenantVerifyResponse {
  ready?: boolean
  missing?: string
  reason?: string
  check?: string
  error?: string
  code?: string
}

interface TenantStatus {
  ready: boolean
  reason: string
  statusCode?: number
}

function buildWorkerEmail(workerIndex: number): string {
  return `${TEST_CONFIG.WORKER_EMAIL_PREFIX}${workerIndex}@${TEST_CONFIG.EMAIL_DOMAIN}`
}

function buildTestHeaders(includeJsonContentType: boolean): Record<string, string> {
  const headers: Record<string, string> = {}
  if (includeJsonContentType) {
    headers["Content-Type"] = "application/json"
  }

  const testSecret = process.env.E2E_TEST_SECRET
  if (testSecret) {
    headers["x-test-secret"] = testSecret
  }

  return headers
}

function getBackoffDelayMs(attempt: number): number {
  const exponentialDelay = TENANT_VERIFY_INITIAL_DELAY_MS * 2 ** Math.max(0, attempt - 1)
  return Math.min(exponentialDelay, TENANT_VERIFY_MAX_DELAY_MS)
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`
  }
  return String(error)
}

function formatWorkerStatus(workerIndex: number, status: TenantStatus): string {
  const statusCode = status.statusCode !== undefined ? ` [${status.statusCode}]` : ""
  return `w${workerIndex}:${status.reason}${statusCode}`
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchTenantStatus(
  baseUrl: string,
  email: string,
  headers: Record<string, string>,
): Promise<TenantStatus> {
  try {
    const res = await fetch(`${baseUrl}/api/test/verify-tenant?email=${encodeURIComponent(email)}`, {
      headers,
      signal: AbortSignal.timeout(TENANT_VERIFY_REQUEST_TIMEOUT_MS),
    })

    const contentType = res.headers.get("content-type") || ""
    if (!contentType.includes("application/json")) {
      const body = compactText(await res.text()).slice(0, 140)
      const bodySuffix = body ? ` (${body})` : ""
      return {
        ready: false,
        reason: `non-json:${res.status}${bodySuffix}`,
        statusCode: res.status,
      }
    }

    const data = (await res.json()) as TenantVerifyResponse
    if (data.ready === true) {
      return { ready: true, reason: "ready", statusCode: res.status }
    }

    if (typeof data.missing === "string" && data.missing.length > 0) {
      return { ready: false, reason: `missing:${data.missing}`, statusCode: res.status }
    }

    if (typeof data.reason === "string" && data.reason.length > 0) {
      const checkSuffix = typeof data.check === "string" && data.check.length > 0 ? `:${data.check}` : ""
      const codeSuffix = typeof data.code === "string" && data.code.length > 0 ? ` (${data.code})` : ""
      return {
        ready: false,
        reason: `${data.reason}${checkSuffix}${codeSuffix}`,
        statusCode: res.status,
      }
    }

    if (typeof data.error === "string" && data.error.length > 0) {
      return { ready: false, reason: `error:${data.error}`, statusCode: res.status }
    }

    if (!res.ok) {
      return { ready: false, reason: `http:${res.status}`, statusCode: res.status }
    }

    return { ready: false, reason: "not-ready", statusCode: res.status }
  } catch (error) {
    return {
      ready: false,
      reason: `network:${normalizeErrorMessage(error)}`,
    }
  }
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
 * Warm up verify endpoint before polling.
 * Next.js dev servers may compile this route lazily, so we trigger that once first.
 */
async function warmupVerifyTenantEndpoint(baseUrl: string, headers: Record<string, string>): Promise<void> {
  const warmupEmail = buildWorkerEmail(0)
  const start = Date.now()
  const status = await fetchTenantStatus(baseUrl, warmupEmail, headers)
  const elapsedMs = Date.now() - start

  if (status.ready || status.reason.startsWith("missing:")) {
    console.log(`   ✓ /api/test/verify-tenant (${elapsedMs}ms)`)
    return
  }

  console.log(`   ⚠ /api/test/verify-tenant warmup (${elapsedMs}ms): ${status.reason}`)
}

/**
 * Poll for tenant readiness with bounded exponential backoff.
 * Replaces short fixed waits with explicit readiness checks and diagnostics.
 */
async function verifyTenantReadiness(baseUrl: string, workers: number, headers: Record<string, string>): Promise<void> {
  const startedAt = Date.now()
  const deadline = startedAt + TENANT_VERIFY_TIMEOUT_MS
  const workerIndices = Array.from({ length: workers }, (_, idx) => idx)
  const lastStatuses = new Map<number, TenantStatus>()
  let attempt = 0

  while (Date.now() < deadline) {
    attempt += 1

    const results = await Promise.all(
      workerIndices.map(async workerIndex => {
        const email = buildWorkerEmail(workerIndex)
        const status = await fetchTenantStatus(baseUrl, email, headers)
        return { workerIndex, status }
      }),
    )

    for (const result of results) {
      lastStatuses.set(result.workerIndex, result.status)
    }

    const readyCount = results.filter(result => result.status.ready).length
    if (readyCount === workers) {
      const elapsedMs = Date.now() - startedAt
      console.log(`   ✓ All tenants ready (verified in ${elapsedMs}ms, ${attempt} attempts)`)
      return
    }

    if (attempt === 1 || attempt % TENANT_VERIFY_LOG_EVERY_ATTEMPTS === 0) {
      const elapsedMs = Date.now() - startedAt
      const waitingWorkers = results
        .filter(result => !result.status.ready)
        .map(result => formatWorkerStatus(result.workerIndex, result.status))
        .join(", ")
      console.log(`   ⏱ Attempt ${attempt}: ${readyCount}/${workers} ready after ${elapsedMs}ms`)
      if (waitingWorkers.length > 0) {
        console.log(`      waiting: ${waitingWorkers}`)
      }
    }

    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) {
      break
    }

    const delayMs = Math.min(getBackoffDelayMs(attempt), remainingMs)
    await sleep(delayMs)
  }

  const elapsedMs = Date.now() - startedAt
  const summary = workerIndices
    .map(workerIndex => {
      const status = lastStatuses.get(workerIndex)
      if (!status) {
        return `w${workerIndex}:no-response`
      }
      return formatWorkerStatus(workerIndex, status)
    })
    .join(", ")

  throw new Error(`Tenant verification timeout after ${elapsedMs}ms. Last status: ${summary}`)
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

  const bootstrapHeaders = buildTestHeaders(true)
  const verifyHeaders = buildTestHeaders(false)

  try {
    await Promise.all(
      Array.from({ length: workers }).map(async (_, i) => {
        const email = buildWorkerEmail(i)
        const workspace = `${TEST_CONFIG.WORKSPACE_PREFIX}${i}.${TEST_CONFIG.EMAIL_DOMAIN}`

        const res = await fetch(`${baseUrl}/api/test/bootstrap-tenant`, {
          method: "POST",
          headers: bootstrapHeaders,
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

    console.log("🔥 Warming tenant verify endpoint...")
    await warmupVerifyTenantEndpoint(baseUrl, verifyHeaders)

    // Poll for tenant readiness instead of fixed delay
    console.log("⏳ Verifying tenant readiness...")
    await verifyTenantReadiness(baseUrl, workers, verifyHeaders)
    console.log("✅ All tenants verified\n")

    // Warm up critical pages before parallel tests start
    // This ensures Next.js has compiled all pages that tests will hit
    await warmupServer(baseUrl)
  } catch (error) {
    console.error("\n❌ [Global Setup] Failed:", error)
    throw error
  }
}
