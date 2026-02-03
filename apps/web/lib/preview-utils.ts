/**
 * Shared utilities for workspace URL generation
 */

import { DOMAINS } from "@webalive/shared"

const PREVIEW_BASE = DOMAINS.PREVIEW_BASE

/**
 * Convert workspace domain to preview subdomain label
 *
 * @example
 * domainToPreviewLabel("protino.alive.best") // "protino-alive-best"
 * domainToPreviewLabel("demo.goalive.nl") // "demo-goalive-nl"
 */
export function domainToPreviewLabel(domain: string): string {
  return domain.replace(/\./g, "-")
}

/**
 * Convert preview label back to domain
 *
 * @example
 * previewLabelToDomain("protino-alive-best") // "protino.alive.best"
 */
export function previewLabelToDomain(label: string): string {
  return label.replace(/-/g, ".")
}

/**
 * Get the actual site URL (production)
 *
 * @example
 * getSiteUrl("protino.alive.best") // "https://protino.alive.best/"
 * getSiteUrl("protino.alive.best", "/about") // "https://protino.alive.best/about"
 */
export function getSiteUrl(workspace: string, path = "/"): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `https://${workspace}${normalizedPath}`
}

/**
 * Get the preview URL (for iframe embedding with auth bypass)
 *
 * @example
 * getPreviewUrl("protino.alive.best") // "https://protino-alive-best.preview.terminal.goalive.nl/"
 * getPreviewUrl("protino.alive.best", { path: "/about" }) // "https://protino-alive-best.preview.../about"
 * getPreviewUrl("protino.alive.best", { path: "/", token: "abc" }) // "https://protino-alive-best.preview.../?preview_token=abc"
 */
export function getPreviewUrl(workspace: string, options?: { path?: string; token?: string }): string {
  const label = domainToPreviewLabel(workspace)
  const path = options?.path ?? "/"
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  const tokenParam = options?.token ? `?preview_token=${options.token}` : ""
  return `https://${label}.${PREVIEW_BASE}${normalizedPath}${tokenParam}`
}
