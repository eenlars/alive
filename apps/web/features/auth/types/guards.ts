import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { DEFAULTS, DOMAINS } from "@webalive/shared"

/**
 * Authentication and CORS guards
 *
 * SERVER-AGNOSTIC: CORS is permissive for any HTTPS origin when credentials
 * are required. Security is enforced via session cookies, not CORS origin checks.
 */

/**
 * Check if a session cookie exists
 */
export function hasSessionCookie(cookie: any): cookie is { value: string } {
  return cookie !== undefined && cookie !== null
}

/**
 * Check if a session cookie value is valid
 */
export function isValidSessionCookie(value: any): value is string {
  return typeof value === "string" && value.length > 0
}

/**
 * Check if a user object is valid
 */
export function hasValidUser(user: any): boolean {
  return user !== null && user !== undefined && typeof user.id === "string"
}

/**
 * Check if an origin is allowed based on allowed domains file
 */
export function isOriginInAllowedDomains(origin: string): boolean {
  try {
    const domainsFile = join(process.cwd(), "allowed-domains.json")

    if (existsSync(domainsFile)) {
      const allowedDomains = JSON.parse(readFileSync(domainsFile, "utf8"))
      return Array.isArray(allowedDomains) && allowedDomains.includes(origin)
    }
  } catch (error) {
    console.warn("Failed to read allowed domains file:", error)
  }

  return false
}

/**
 * Check if an origin matches the allowed domain pattern (.sonno.tech)
 */
export function isOriginGoaliveNLDomain(origin: string): boolean {
  return origin.endsWith(DOMAINS.MAIN_SUFFIX)
}

/**
 * Check if an origin matches the wildcard domain pattern
 */
export function isOriginWildcardDomain(origin: string): boolean {
  if (!DOMAINS.WILDCARD) return false
  return origin.endsWith(`.${DOMAINS.WILDCARD}`) || origin === `https://${DOMAINS.WILDCARD}`
}

/**
 * Check if an origin is a valid HTTPS origin (server-agnostic mode)
 * Allows any HTTPS origin - security is enforced via session cookies
 */
export function isValidHttpsOrigin(origin: string): boolean {
  return origin.startsWith("https://")
}

/**
 * Check if an origin is localhost (development)
 */
export function isLocalhostOrigin(origin: string): boolean {
  return origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1")
}

/**
 * Check if an origin is allowed
 *
 * SERVER-AGNOSTIC: Allows any HTTPS origin or localhost.
 * Security is enforced via httpOnly session cookies with sameSite=lax,
 * not via CORS origin restrictions.
 */
export function isOriginAllowed(origin: string): boolean {
  return (
    isOriginInAllowedDomains(origin) ||
    isOriginGoaliveNLDomain(origin) ||
    isOriginWildcardDomain(origin) ||
    isValidHttpsOrigin(origin) ||
    isLocalhostOrigin(origin)
  )
}

/**
 * Get the allowed origin for CORS response
 * Returns matched origin or sensible fallback
 */
export function getAllowedOrigin(requestOrigin: string | null): string {
  if (!requestOrigin) {
    return DEFAULTS.FALLBACK_ORIGIN
  }

  if (isOriginAllowed(requestOrigin)) {
    return requestOrigin
  }

  return DEFAULTS.FALLBACK_ORIGIN
}

/**
 * Check if an origin is null/undefined
 */
export function hasOrigin(origin: string | null): origin is string {
  return origin !== null && origin !== undefined && origin.length > 0
}

/**
 * Check if a referer header exists and is valid
 */
export function hasValidReferer(referer: string | null): referer is string {
  return referer !== null && referer !== undefined && referer.length > 0
}

/**
 * Extract origin from referer header if available
 */
export function extractOriginFromReferer(referer: string | null): string | undefined {
  if (!hasValidReferer(referer)) {
    return undefined
  }
  const parts = referer.split("/").slice(0, 3)
  return parts.join("/")
}
