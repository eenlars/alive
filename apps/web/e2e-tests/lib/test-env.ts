/**
 * E2E Test Environment Detection (PURE - no side effects)
 *
 * This module only READS and VALIDATES process.env.TEST_ENV.
 * Env loading happens in load-env.ts (imported first in playwright configs).
 *
 * Environment values:
 * - "staging"    → Staging environment
 */

export const VALID_ENVS = ["staging"] as const
export type ValidEnv = (typeof VALID_ENVS)[number]

/** Validate and return TEST_ENV */
function getTestEnv(): ValidEnv {
  const env = process.env.TEST_ENV

  if (!env) {
    throw new Error(
      "TEST_ENV not set. The .env file must contain TEST_ENV=staging\n" +
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
 * Always false: local test lane is disabled.
 */
export const isLocalTestServer = false

/**
 * Always true: E2E is staging-only.
 */
export const isRemoteEnv = true

/**
 * Test timeouts based on environment.
 * Remote environments need longer timeouts due to network latency.
 */
export const TIMEOUTS = {
  /** Default test timeout */
  DEFAULT: 60_000,
  /** Long-running operations (deployments) */
  DEPLOYMENT: 180_000,
  /** Extended operations (concurrent deployments) */
  EXTENDED: 300_000,
} as const
