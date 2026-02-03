/**
 * E2E Test Environment Detection (PURE - no side effects)
 *
 * This module only READS and VALIDATES process.env.TEST_ENV.
 * Env loading happens in load-env.ts (imported first in playwright configs).
 *
 * Environment values:
 * - "local"      → Local test server (PLAYWRIGHT_TEST=true, BRIDGE_ENV=local)
 * - "staging"    → Staging (staging.terminal.goalive.nl)
 * - "production" → Production (terminal.goalive.nl)
 */

export const VALID_ENVS = ["local", "staging", "production"] as const
export type ValidEnv = (typeof VALID_ENVS)[number]

/** Validate and return TEST_ENV */
function getTestEnv(): ValidEnv {
  const env = process.env.TEST_ENV

  if (!env) {
    throw new Error(
      "TEST_ENV not set. The .env file must contain TEST_ENV=local|staging|production\n" +
        "Check that ENV_FILE points to a valid .env file.",
    )
  }

  if (!VALID_ENVS.includes(env as ValidEnv)) {
    throw new Error(`Invalid TEST_ENV="${env}". Valid: ${VALID_ENVS.join(", ")}`)
  }

  return env as ValidEnv
}

export const TEST_ENV = getTestEnv()

/**
 * True when running against local test server.
 *
 * Local test server has:
 * - PLAYWRIGHT_TEST=true (blocks real API calls)
 * - BRIDGE_ENV=local (enables test credentials)
 * - Test database with isolated worker tenants
 *
 * Use this for tests that REQUIRE local server features.
 */
export const isLocalTestServer = TEST_ENV === "local"

/**
 * True when running against any remote/deployed environment.
 *
 * Remote environments (staging, production, etc.) do NOT have:
 * - PLAYWRIGHT_TEST=true
 * - BRIDGE_ENV=local
 * - Test credentials (test@bridge.local)
 *
 * This is the inverse of isLocalTestServer - if a new environment
 * is added and TEST_ENV is set to something other than "local",
 * it will be treated as remote (safe default).
 */
export const isRemoteEnv = !isLocalTestServer

/**
 * Test timeouts based on environment.
 * Remote environments need longer timeouts due to network latency.
 */
export const TIMEOUTS = {
  /** Default test timeout */
  DEFAULT: isRemoteEnv ? 60_000 : 30_000,
  /** Long-running operations (deployments) */
  DEPLOYMENT: isRemoteEnv ? 180_000 : 70_000,
  /** Extended operations (concurrent deployments) */
  EXTENDED: isRemoteEnv ? 300_000 : 120_000,
} as const
