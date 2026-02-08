/**
 * Shared utilities for workspace URL generation
 *
 * Preview subdomains use single-level pattern to stay under *.WILDCARD_DOMAIN,
 * which is covered by Cloudflare Universal SSL:
 *   preview--{label}.{WILDCARD_DOMAIN}
 *
 * Examples (sonno.tech server):
 *   protino.sonno.tech → preview--protino-sonno-tech.sonno.tech
 * Examples (alive.best server):
 *   mysite.alive.best → preview--mysite-alive-best.alive.best
 */

import { env } from "@webalive/env/client"

/** Prefix for preview subdomains. Constant across all servers. */
const PREVIEW_PREFIX = "preview--"

/** The wildcard domain (e.g., "sonno.tech" or "alive.best") */
const WILDCARD_DOMAIN = env.NEXT_PUBLIC_PREVIEW_BASE

/**
 * Convert workspace domain to preview subdomain label
 *
 * @example
 * domainToPreviewLabel("protino.sonno.tech") // "protino-sonno-tech"
 * domainToPreviewLabel("demo.alive.best") // "demo-alive-best"
 */
export function domainToPreviewLabel(domain: string): string {
  return domain.replace(/\./g, "-")
}

/**
 * Convert preview label back to domain
 *
 * @example
 * previewLabelToDomain("protino-sonno-tech") // "protino.sonno.tech"
 */
export function previewLabelToDomain(label: string): string {
  return label.replace(/-/g, ".")
}

/**
 * Check if a hostname is a preview subdomain.
 *
 * NOTE: This only checks the prefix — it does NOT validate the wildcard domain
 * suffix. Do NOT use as a standalone security gate. For full validation
 * (prefix + suffix), use `extractWorkspaceFromPreviewHost()` instead.
 *
 * @example
 * isPreviewHost("preview--protino-sonno-tech.sonno.tech") // true
 * isPreviewHost("protino.sonno.tech") // false
 */
export function isPreviewHost(host: string): boolean {
  return host.startsWith(PREVIEW_PREFIX)
}

/**
 * Extract the workspace domain from a preview hostname
 *
 * @example
 * extractWorkspaceFromPreviewHost("preview--protino-sonno-tech.sonno.tech")
 * // → "protino.sonno.tech"
 */
export function extractWorkspaceFromPreviewHost(host: string): string | null {
  if (!host.startsWith(PREVIEW_PREFIX)) {
    return null
  }

  // Strip prefix: "preview--protino-sonno-tech.sonno.tech" → "protino-sonno-tech.sonno.tech"
  const rest = host.slice(PREVIEW_PREFIX.length)

  // Find the wildcard domain suffix
  const suffix = `.${WILDCARD_DOMAIN}`
  if (!rest.endsWith(suffix)) {
    return null
  }

  // Extract label: "protino-sonno-tech"
  const label = rest.slice(0, -suffix.length)
  if (!label) {
    return null
  }

  return previewLabelToDomain(label)
}

/**
 * Get the actual site URL (production)
 *
 * @example
 * getSiteUrl("protino.sonno.tech") // "https://protino.sonno.tech/"
 * getSiteUrl("protino.sonno.tech", "/about") // "https://protino.sonno.tech/about"
 */
export function getSiteUrl(workspace: string, path = "/"): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `https://${workspace}${normalizedPath}`
}

/**
 * Get the preview URL (for iframe embedding with auth bypass)
 *
 * Uses single-level subdomain pattern: preview--{label}.{WILDCARD_DOMAIN}
 * This stays under *.WILDCARD which Cloudflare Universal SSL covers.
 *
 * @example
 * getPreviewUrl("protino.sonno.tech") // "https://preview--protino-sonno-tech.sonno.tech/"
 * getPreviewUrl("protino.sonno.tech", { path: "/about" }) // "https://preview--protino-sonno-tech.sonno.tech/about"
 * getPreviewUrl("mysite.alive.best") // "https://preview--mysite-alive-best.alive.best/"
 */
export function getPreviewUrl(workspace: string, options?: { path?: string; token?: string }): string {
  const label = domainToPreviewLabel(workspace)
  const path = options?.path ?? "/"
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  const tokenParam = options?.token ? `?preview_token=${encodeURIComponent(options.token)}` : ""
  return `https://${PREVIEW_PREFIX}${label}.${WILDCARD_DOMAIN}${normalizedPath}${tokenParam}`
}
