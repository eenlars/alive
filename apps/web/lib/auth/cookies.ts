/**
 * Cookie Configuration
 *
 * Cookie names and session config imported from @webalive/shared (single source of truth).
 * This file provides cookie options helpers for Next.js.
 *
 * SERVER-AGNOSTIC: Cookie domain is extracted dynamically from the request host,
 * allowing the app to work on any domain without hardcoding.
 */

import { COOKIE_NAMES, SESSION_MAX_AGE } from "@webalive/shared"

// Re-export for backward compatibility
export { COOKIE_NAMES, SESSION_MAX_AGE }

type CookieOptions = {
  httpOnly?: boolean
  secure?: boolean
  sameSite?: "lax" | "strict" | "none"
  path?: string
  maxAge?: number
  expires?: Date
  domain?: string
}

/**
 * Check if running on a deployed server (dev/staging/production)
 * Local development uses STREAM_ENV=local
 */
function isDeployedServer(): boolean {
  // STREAM_ENV=local means local development (localhost)
  // All other environments (dev, staging, production) are deployed servers
  return process.env.STREAM_ENV !== "local"
}

/**
 * Extract the root domain from a host for cookie domain setting.
 * Returns the domain with a leading dot for subdomain sharing.
 *
 * Examples:
 * - "app.sonnno.tech" -> ".sonnno.tech"
 * - "terminal.goalive.nl" -> ".goalive.nl"
 * - "dev.terminal.goalive.nl" -> ".goalive.nl"
 * - "alive.best" -> ".alive.best"
 * - "localhost:3000" -> undefined (no domain for localhost)
 *
 * @param host - The request host (e.g., "app.example.com" or "app.example.com:3000")
 */
function extractRootDomain(host: string): string | undefined {
  // Remove port if present
  const hostname = host.split(":")[0]

  // Don't set domain for localhost/IP addresses
  if (hostname === "localhost" || hostname === "127.0.0.1" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return undefined
  }

  const parts = hostname.split(".")

  // Need at least 2 parts for a valid domain (e.g., "example.com")
  if (parts.length < 2) {
    return undefined
  }

  // Get the last 2 parts as the root domain
  // This works for most TLDs (.com, .nl, .tech, .best, etc.)
  // Note: Does not handle special TLDs like .co.uk - add explicit handling if needed
  const rootDomain = parts.slice(-2).join(".")

  return `.${rootDomain}`
}

/**
 * Get cookie domain based on request host.
 * Dynamically extracts root domain to work with ANY domain.
 */
function getCookieDomain(host?: string): string | undefined {
  if (!host) {
    return undefined
  }

  return extractRootDomain(host)
}

/**
 * Get standard cookie options for session cookies
 * Automatically handles production vs development secure flag
 *
 * Uses sameSite: "lax" for browser compatibility and session persistence.
 * "none" was causing Safari ITP to clear cookies within 24 hours.
 * "lax" works for same-origin requests and top-level navigations.
 *
 * Note: Preview iframes use separate token-based auth via /api/auth/preview-token
 *
 * @param host - Optional request host to determine cookie domain
 */
export function getSessionCookieOptions(host?: string): CookieOptions {
  const isDeployed = isDeployedServer()
  return {
    httpOnly: true,
    secure: isDeployed,
    // ALWAYS use "lax" - Safari ITP clears "none" cookies within 24 hours
    // Preview iframes use token-based auth instead of relying on this cookie
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
    // Domain set dynamically based on request host
    ...(isDeployed && { domain: getCookieDomain(host) }),
  }
}

/**
 * Get cookie options for clearing a cookie
 * Must match the original cookie's attributes except value/expiry
 *
 * @param host - Optional request host to determine cookie domain
 */
export function getClearCookieOptions(host?: string): CookieOptions {
  const isDeployed = isDeployedServer()
  return {
    httpOnly: true,
    secure: isDeployed,
    sameSite: "lax", // Must match getSessionCookieOptions
    path: "/",
    expires: new Date(0), // Expire immediately
    ...(isDeployed && { domain: getCookieDomain(host) }),
  }
}
