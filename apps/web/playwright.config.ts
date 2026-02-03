// FIRST: Load env file (side effect import - must be first!)
import "./e2e-tests/lib/load-env"

// Now safe to import modules that read process.env
import { defineConfig } from "@playwright/test"
import { DOMAINS, TEST_CONFIG } from "@webalive/shared"
import { isRemoteEnv, TEST_ENV, TIMEOUTS } from "./e2e-tests/lib/test-env"

// Use TEST_CONFIG.PORT for testing to avoid conflicts with production (8999)
const LOCAL_BASE_URL = `http://localhost:${TEST_CONFIG.PORT}`

// Determine base URL based on environment (TEST_ENV is validated, no fallback needed)
const BASE_URLS: Record<string, string> = {
  local: LOCAL_BASE_URL,
  staging: DOMAINS.BRIDGE_STAGING,
  production: DOMAINS.BRIDGE_PROD,
}
const baseURL = BASE_URLS[TEST_ENV]

// Enforce worker limits against centralized config (single source of truth)
// - CI: 2 workers (conservative for shared runners)
// - Remote/Local: 4 workers (6 caused flaky failures due to resource contention)
const desiredWorkers = process.env.CI ? 2 : 4
const maxWorkers = TEST_CONFIG.MAX_WORKERS

if (desiredWorkers > maxWorkers) {
  throw new Error(
    `Playwright workers (${desiredWorkers}) exceeds TEST_CONFIG.MAX_WORKERS (${maxWorkers}). ` +
      "Update TEST_CONFIG.MAX_WORKERS in packages/shared/src/constants.ts",
  )
}

export default defineConfig({
  testDir: "./e2e-tests",
  testMatch: "**/*.spec.ts", // Standard Playwright convention
  testIgnore: "**/*-genuine.spec.ts", // Exclude genuine tests (run separately with playwright.genuine.config.ts)
  timeout: TIMEOUTS.DEFAULT,
  retries: process.env.CI ? 2 : 1, // Retry flaky tests (more retries in CI)
  workers: desiredWorkers, // Validated against TEST_CONFIG.MAX_WORKERS
  globalSetup: "./e2e-tests/global-setup.ts",
  globalTeardown: "./e2e-tests/global-teardown.ts",

  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },

  // Only start web server for local tests (remote environments use deployed servers)
  webServer: isRemoteEnv
    ? undefined
    : {
        command: "bash scripts/start-test-server.sh",
        url: LOCAL_BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180000, // Increased timeout for slower starts
      },

  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
})
