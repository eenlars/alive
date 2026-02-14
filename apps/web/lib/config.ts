/**
 * Web application configuration
 *
 * Domain config loaded from server-config.json via @webalive/shared (single source of truth).
 * Env vars (MAIN_DOMAIN, etc.) override if set, but are NOT required — server-config.json
 * provides all values. See packages/shared/src/config.ts for the loading logic.
 */

import { env } from "@webalive/env/server"
import { DOMAINS, PATHS } from "@webalive/shared"

export const MAIN_DOMAIN = DOMAINS.MAIN
export const WILDCARD_DOMAIN = DOMAINS.WILDCARD
export const PREVIEW_BASE = DOMAINS.PREVIEW_BASE
export const COOKIE_DOMAIN = DOMAINS.COOKIE_DOMAIN
export const STREAM_PROD_URL = DOMAINS.STREAM_PROD
export const STREAM_STAGING_URL = DOMAINS.STREAM_STAGING
export const STREAM_DEV_URL = DOMAINS.STREAM_DEV

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
