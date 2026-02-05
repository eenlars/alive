/**
 * Playwright Fixtures - Worker-Isolated Tenants
 *
 * Each worker gets dedicated tenant with JWT authentication.
 * All persisted stores are pre-injected via localStorage to ensure
 * deterministic hydration and eliminate race conditions.
 */

import { test as base, type Page } from "@playwright/test"
import { COOKIE_NAMES, createTestStorageState, DOMAINS, TEST_CONFIG } from "@webalive/shared"
import jwt from "jsonwebtoken"

export interface TestUser {
  userId: string
  email: string
  orgId: string
  orgName: string
  workspace: string
  workerIndex: number
}

type TestFixtures = {
  /** Full tenant info from bootstrap - use this in new tests */
  workerTenant: TestUser
  /** Alias for workerTenant - backwards compatibility */
  tenant: TestUser
  /** Pre-authenticated page with JWT cookie and localStorage set */
  authenticatedPage: Page
}

type WorkerFixtures = {
  workerStorageState: TestUser
}

/**
 * Mock HTML for preview iframe - loads instantly instead of real sites
 */
const MOCK_PREVIEW_HTML = `<!DOCTYPE html>
<html>
<head><title>Mock Preview</title></head>
<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#1a1a1a;color:#666;font-family:system-ui">
  <div style="text-align:center">
    <div style="font-size:48px;margin-bottom:16px">🧪</div>
    <div>E2E Test Preview</div>
  </div>
</body>
</html>`

export const test = base.extend<TestFixtures, WorkerFixtures>({
  // Override page fixture to mock preview iframe requests
  page: async ({ page }, use) => {
    // Mock all requests to preview subdomains - these are slow to load and not needed for tests
    await page.route(`**/*.${DOMAINS.PREVIEW_BASE}/**`, route => {
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: MOCK_PREVIEW_HTML,
      })
    })

    await use(page)
  },

  // Worker-scoped: fetch tenant once per worker
  workerStorageState: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires destructuring even when no fixtures are used
    async ({}, use, workerInfo) => {
      const runId = process.env.E2E_RUN_ID
      // Wrap workerIndex to stay within configured worker slots
      // Playwright can assign high indices on retries, but we only have MAX_WORKERS slots
      const workerIndex = workerInfo.workerIndex % TEST_CONFIG.MAX_WORKERS

      if (!runId) {
        throw new Error("E2E_RUN_ID not set - global setup not run?")
      }

      // Use baseURL from Playwright config (handles staging/production)
      // Falls back to TEST_CONFIG.BASE_URL for local tests
      const baseUrl = workerInfo.project.use.baseURL || TEST_CONFIG.BASE_URL

      // Get test secret for staging/production E2E tests
      const testSecret = process.env.E2E_TEST_SECRET
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (testSecret) {
        headers["x-test-secret"] = testSecret
      }

      // Fetch tenant for this worker
      const email = `${TEST_CONFIG.WORKER_EMAIL_PREFIX}${workerIndex}@${TEST_CONFIG.EMAIL_DOMAIN}`
      const workspace = `${TEST_CONFIG.WORKSPACE_PREFIX}${workerIndex}.${TEST_CONFIG.EMAIL_DOMAIN}`

      const res = await fetch(`${baseUrl}/api/test/bootstrap-tenant`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          runId,
          workerIndex,
          email,
          workspace,
        }),
      })

      if (!res.ok) {
        throw new Error(
          `Failed to bootstrap tenant for worker ${workerIndex} (runId=${runId}): ${res.status} ${res.statusText}`,
        )
      }

      const data = await res.json()

      if (!data.ok) {
        throw new Error(`Failed to get tenant for worker ${workerIndex}: ${data.error}`)
      }

      await use(data.tenant)
    },
    { scope: "worker" },
  ],

  // Test-scoped: pass worker storage to tests
  workerTenant: async ({ workerStorageState }, use) => {
    await use(workerStorageState)
  },

  // Alias for backwards compatibility with tests using `tenant`
  tenant: async ({ workerStorageState }, use) => {
    await use(workerStorageState)
  },

  // Test-scoped: authenticated page for each test
  // Sets JWT cookie AND localStorage via context-level init script
  authenticatedPage: async ({ page, context, workerStorageState, baseURL }, use) => {
    // Determine if we're running against a remote environment
    const isRemote = baseURL?.startsWith("https://") ?? false

    // For remote environments, use JWT_SECRET from env; for local use TEST_CONFIG
    const jwtSecret = isRemote ? process.env.JWT_SECRET : TEST_CONFIG.JWT_SECRET
    if (!jwtSecret) {
      throw new Error("JWT_SECRET not set for E2E tests (required for staging/production)")
    }

    const token = jwt.sign(
      {
        sub: workerStorageState.userId,
        userId: workerStorageState.userId,
        email: workerStorageState.email,
        name: workerStorageState.orgName,
        workspaces: [workerStorageState.workspace],
      },
      jwtSecret,
      { expiresIn: "30d" },
    )

    // Extract domain from baseURL for cookie (e.g., "staging.terminal.goalive.nl")
    const cookieDomain = baseURL ? new URL(baseURL).hostname : "localhost"

    // Set auth cookie
    await context.addCookies([
      {
        name: COOKIE_NAMES.SESSION,
        value: token,
        domain: cookieDomain,
        path: "/",
        httpOnly: true,
        secure: isRemote,
        sameSite: "Lax",
      },
    ])

    // Pre-inject ALL persisted store defaults via context-level init script
    // This runs BEFORE any page JavaScript, ensuring Zustand hydrates correctly
    // and eliminates race conditions from stores that read each other
    const storageEntries = createTestStorageState({
      workspace: workerStorageState.workspace,
      orgId: workerStorageState.orgId,
      // E2E tests should run with clean defaults
      featureFlags: {},
      debug: {
        isDebugView: false,
        showSSETerminal: false,
        showSandbox: false,
      },
    })

    // Inject all storage entries in a single init script
    // Supports both localStorage (default) and sessionStorage
    await context.addInitScript(entries => {
      for (const { key, value, storage } of entries) {
        if (storage === "sessionStorage") {
          sessionStorage.setItem(key, value)
        } else {
          localStorage.setItem(key, value)
        }
      }
      // Set test mode flag for E2E instrumentation
      ;(window as any).PLAYWRIGHT_TEST = true
    }, storageEntries)

    // Mock the all-workspaces API to include the test workspace
    // Without this, the workspace store validates against real workspaces on disk
    // and clears our injected test workspace to null
    await page.route("**/api/auth/all-workspaces", async route => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          workspaces: {
            [workerStorageState.orgId]: [workerStorageState.workspace],
          },
        }),
      })
    })

    await use(page)
  },
})

export { expect } from "@playwright/test"
