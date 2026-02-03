/**
 * Playwright Multi-Port Configuration
 *
 * This configuration provides maximum test isolation by running a separate
 * Next.js server instance for each Playwright worker.
 *
 * Benefits:
 * - Zero shared-server contention between workers
 * - Eliminates p99 latency spikes from server-side resource competition
 * - Better determinism for performance measurements
 *
 * Trade-offs:
 * - Higher memory usage (one server per worker)
 * - Longer startup time (multiple servers must initialize)
 * - More complex infrastructure
 *
 * Usage:
 *   npx playwright test --config=playwright.multi-port.config.ts
 *
 * When to use:
 * - Performance regression testing
 * - Debugging flaky tests that only fail under parallel load
 * - CI environments with available resources
 *
 * For most use cases, the standard playwright.config.ts with coordinated
 * hydration (Phase 1 & 2) is sufficient and more resource-efficient.
 */

// FIRST: Load env file (side effect import - must be first!)
import "./e2e-tests/lib/load-env"

// Now safe to import modules that read process.env
import { defineConfig } from "@playwright/test"
import { TEST_CONFIG } from "@webalive/shared"
import { TIMEOUTS } from "./e2e-tests/lib/test-env"

const NUM_WORKERS = process.env.CI ? 2 : 4
const PORT_BASE = TEST_CONFIG.WORKER_PORT_BASE // 9100

/**
 * Generate projects for each worker, each pointing to its own port.
 *
 * Worker 0 → http://localhost:9100
 * Worker 1 → http://localhost:9101
 * Worker 2 → http://localhost:9102
 * Worker 3 → http://localhost:9103
 */
const projects = Array.from({ length: NUM_WORKERS }, (_, i) => ({
  name: `e2e-w${i}`,
  use: {
    browserName: "chromium" as const,
    baseURL: `http://localhost:${PORT_BASE + i}`,
  },
  // Each project uses 1 worker (total parallelism = NUM_WORKERS)
  metadata: { workerIndex: i },
}))

export default defineConfig({
  testDir: "./e2e-tests",
  testMatch: "**/*.spec.ts",
  testIgnore: "**/*-genuine.spec.ts",
  timeout: TIMEOUTS.DEFAULT,
  retries: process.env.CI ? 2 : 1,

  // Each project has workers: 1, so total parallelism = NUM_WORKERS
  // This ensures worker 0 always uses port 9100, worker 1 uses 9101, etc.
  fullyParallel: true,
  workers: 1, // 1 worker per project (projects provide parallelism)

  globalSetup: "./e2e-tests/global-setup.ts",
  globalTeardown: "./e2e-tests/global-teardown.ts",

  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },

  // Start all servers via multi-port script
  webServer: {
    command: `bash scripts/start-multi-port-servers.sh ${NUM_WORKERS}`,
    url: `http://localhost:${PORT_BASE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300000, // 5 minutes for multiple servers to start
  },

  projects,
})
