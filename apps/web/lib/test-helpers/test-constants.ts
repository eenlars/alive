/**
 * Test Constants
 *
 * Single source of truth for test configuration
 * NEVER hardcode these values in tests - always import from here
 */

import { COOKIE_NAMES, TEST_CONFIG } from "@webalive/shared"
import { environments } from "@webalive/shared/environments"

/**
 * API endpoints for testing
 * Automatically uses local or production based on BRIDGE_ENV
 */
const getApiUrl = (path: string): string => {
  const baseUrl =
    process.env.BRIDGE_ENV === "local"
      ? `http://localhost:${environments.production.port}`
      : `https://${environments.production.domain}`
  return `${baseUrl}${path}`
}

export const API_ENDPOINTS = {
  DEPLOY_SUBDOMAIN: getApiUrl("/api/deploy-subdomain"),
  LOGIN: getApiUrl("/api/login"),
  TOKENS: getApiUrl("/api/tokens"),
  VERIFY: getApiUrl("/api/verify"),
} as const

/**
 * Test user credentials
 * Used consistently across all tests
 * Uses TEST_CONFIG from @webalive/shared as single source of truth
 */
export const TEST_CREDENTIALS = {
  PASSWORD: TEST_CONFIG.TEST_PASSWORD,
  CREDITS: TEST_CONFIG.DEFAULT_CREDITS,
} as const

/**
 * Session cookie configuration
 * Uses COOKIE_NAMES.SESSION from @webalive/shared as single source of truth
 */
export const SESSION_COOKIE = {
  NAME: COOKIE_NAMES.SESSION,
  PATTERN: new RegExp(`${COOKIE_NAMES.SESSION}=([^;]+)`),
} as const
