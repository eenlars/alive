/**
 * Client-safe configuration constants
 *
 * This file contains only constants that are safe to use in client components.
 * For server-side config with env vars, use ./config.ts
 */

import { DOMAINS } from "@webalive/shared"

/**
 * Wildcard domain for subdomain deployment
 * Uses hardcoded constant - no server env var access needed
 */
export const WILDCARD_DOMAIN = DOMAINS.WILDCARD
export const WILDCARD_PATTERN = `*.${WILDCARD_DOMAIN}`

/**
 * Build full subdomain from slug
 */
export function buildSubdomain(slug: string): string {
  return `${slug.toLowerCase()}.${WILDCARD_DOMAIN}`
}

/**
 * Check if domain is a wildcard subdomain
 */
export function isWildcardSubdomain(domain: string): boolean {
  return domain.endsWith(`.${WILDCARD_DOMAIN}`)
}

/**
 * Extract slug from wildcard subdomain
 */
export function extractSlugFromDomain(domain: string): string | null {
  if (!isWildcardSubdomain(domain)) return null
  return domain.replace(`.${WILDCARD_DOMAIN}`, "")
}
