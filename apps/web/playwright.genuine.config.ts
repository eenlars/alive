// FIRST: Load env file (side effect import - must be first!)
import "./e2e-tests/lib/load-env"

import { defineConfig } from "@playwright/test"

/**
 * Playwright Config - Genuine API Integration Tests
 *
 * This config is for E2E tests that make REAL API calls (no mocks).
 * Uses a separate test server without PLAYWRIGHT_TEST=true.
 *
 * Run with: bun run test:e2e:genuine
 */

// Use local test server (port 9548, without PLAYWRIGHT_TEST=true)
const BASE_URL = "http://localhost:9548"

export default defineConfig({
  testDir: "./e2e-tests",
  testMatch: "**/*-genuine.spec.ts", // Only run *-genuine.spec.ts tests
  timeout: 60000, // Longer timeout for real API calls
  workers: 1, // Sequential execution

  // Global setup/teardown for test workspace
  globalSetup: "./e2e-tests/genuine-setup.ts",
  globalTeardown: "./e2e-tests/genuine-teardown.ts",

  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },

  // Start local test server without PLAYWRIGHT_TEST=true
  // This allows genuine API calls to go through
  webServer: {
    command: "bash scripts/start-test-server-genuine.sh",
    port: 9548,
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
  },

  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        baseURL: BASE_URL,
      },
    },
  ],
})
