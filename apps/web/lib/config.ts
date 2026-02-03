/**
 * Web application configuration
 *
 * Imports from centralized constants in @webalive/site-controller
 * See packages/site-controller/src/config.ts for all hardcoded constants
 */

import { env } from "@webalive/env/server"
import { DOMAINS, PATHS } from "@webalive/shared"

export const WILDCARD_DOMAIN = env.WILDCARD_TLD || DOMAINS.WILDCARD
export const WILDCARD_PATTERN = `*.${WILDCARD_DOMAIN}`
export const WORKSPACE_BASE = env.WORKSPACE_BASE || PATHS.SITES_ROOT

export function buildSubdomain(slug: string): string {
  return `${slug.toLowerCase()}.${WILDCARD_DOMAIN}`
}

export function isWildcardSubdomain(domain: string): boolean {
  return domain.endsWith(`.${WILDCARD_DOMAIN}`)
}

export function extractSlugFromDomain(domain: string): string | null {
  if (!isWildcardSubdomain(domain)) return null
  return domain.replace(`.${WILDCARD_DOMAIN}`, "")
}
