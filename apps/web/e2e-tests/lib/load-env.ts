/**
 * Environment File Loader (SIDE EFFECT MODULE)
 *
 * This module MUST be imported first in playwright.config.ts.
 * It loads the env file so other modules can read process.env.
 *
 * Usage: import "./e2e-tests/lib/load-env" // First import!
 *
 * E2E is pinned to staging only.
 */

import { existsSync } from "node:fs"
import dotenv from "dotenv"

const DEFAULT_ENV_FILE = ".env.staging"
const ENV_FILE = (process.env.ENV_FILE || DEFAULT_ENV_FILE).trim()

if (!existsSync(ENV_FILE)) {
  throw new Error(
    `\n❌ Missing env file: ${ENV_FILE}\n` +
      "   Available: .env.staging\n" +
      "   Usage: ENV_FILE=.env.staging bun run test:e2e\n",
  )
}

const result = dotenv.config({ path: ENV_FILE, override: true, quiet: true })

if (result.error) {
  throw new Error(`Failed to load ${ENV_FILE}: ${result.error.message}`)
}

// Verify TEST_ENV was loaded
if (!process.env.TEST_ENV) {
  throw new Error(`\n❌ ${ENV_FILE} is missing TEST_ENV\n   The file must declare: TEST_ENV=staging\n`)
}

if (process.env.TEST_ENV !== "staging") {
  throw new Error(
    `\n❌ Invalid TEST_ENV=${process.env.TEST_ENV} for E2E.\n` +
      "   E2E is pinned to staging only.\n" +
      "   Use: ENV_FILE=.env.staging bun run test:e2e\n",
  )
}

console.log(`📁 [E2E] Loaded ${ENV_FILE} (TEST_ENV=${process.env.TEST_ENV})`)
