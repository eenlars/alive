/**
 * Web application configuration
 *
 * Imports from centralized constants in @webalive/site-controller
 * See packages/site-controller/src/config.ts for all hardcoded constants
 *
 * Domain and stream URL configuration is now wired through validated env schema
 * (packages/env/src/schema.ts) which enforces required fields at startup.
 */

import { env } from "@webalive/env/server"
import {
  getWildcardDomain,
  getMainDomain,
  getPreviewBase,
  getCookieDomain,
  getStreamProdUrl,
  getStreamStagingUrl,
  getStreamDevUrl,
} from "@webalive/env/server"
import { PATHS } from "@webalive/shared"

export const MAIN_DOMAIN = getMainDomain()
export const WILDCARD_DOMAIN = getWildcardDomain()
export const PREVIEW_BASE = getPreviewBase()
export const COOKIE_DOMAIN = getCookieDomain()
export const STREAM_PROD_URL = getStreamProdUrl()
export const STREAM_STAGING_URL = getStreamStagingUrl()
export const STREAM_DEV_URL = getStreamDevUrl()

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
