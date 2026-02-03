/**
 * Playwright Test Helpers
 *
 * Reusable utilities for E2E tests with Playwright
 */

import type { BrowserContext, Page } from "@playwright/test"
import { COOKIE_NAMES, TEST_CONFIG } from "@webalive/shared"

/**
 * Authentication cookie configuration
 * Centralized to ensure consistency across all tests
 * Uses COOKIE_NAMES.SESSION from @webalive/shared as single source of truth
 */
export const AUTH_COOKIE_CONFIG = {
  name: COOKIE_NAMES.SESSION,
  domain: "localhost",
  path: "/",
  httpOnly: true,
  secure: false, // Must be false for local test server (HTTP, not HTTPS)
  sameSite: "Lax" as const,
}

/**
 * Set authentication cookie in Playwright browser context
 *
 * @param page - Playwright page object
 * @param token - JWT session token
 * @param baseURL - Base URL for the test server (defaults to TEST_CONFIG.BASE_URL)
 */
export async function setAuthCookie(page: Page, token: string, baseURL = TEST_CONFIG.BASE_URL): Promise<void> {
  await page.context().addCookies([
    {
      name: AUTH_COOKIE_CONFIG.name,
      value: token,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
      url: baseURL, // URL includes domain and path, don't specify them separately
    },
  ])
}

/**
 * Set authentication cookie in Playwright browser context (direct context access)
 *
 * @param context - Playwright browser context
 * @param token - JWT session token
 */
export async function setAuthCookieInContext(context: BrowserContext, token: string): Promise<void> {
  await context.addCookies([
    {
      ...AUTH_COOKIE_CONFIG,
      value: token,
    },
  ])
}

/**
 * Clear authentication cookie from Playwright browser context
 *
 * @param page - Playwright page object
 */
export async function clearAuthCookie(page: Page): Promise<void> {
  await page.context().clearCookies()
}
