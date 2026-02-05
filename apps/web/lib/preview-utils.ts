/**
 * Shared utilities for workspace URL generation
 */

import { env } from "@webalive/env/client"

// Use validated client env for type-safe access
const PREVIEW_BASE = env.NEXT_PUBLIC_PREVIEW_BASE

/**
 * Convert workspace domain to preview subdomain label
 *
 * @example
 * domainToPreviewLabel("protino.sonno.tech") // "protino-sonno-tech"
 * domainToPreviewLabel("demo.sonno.tech") // "demo-sonno-tech"
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
 * @example
 * getPreviewUrl("protino.sonno.tech") // "https://protino-sonno-tech.preview.sonno.tech/"
 * getPreviewUrl("protino.sonno.tech", { path: "/about" }) // "https://protino-sonno-tech.preview.sonno.tech/about"
 * getPreviewUrl("protino.sonno.tech", { path: "/", token: "abc" }) // "https://protino-sonno-tech.preview.sonno.tech/?preview_token=abc"
 */
export function getPreviewUrl(workspace: string, options?: { path?: string; token?: string }): string {
  const label = domainToPreviewLabel(workspace)
  const path = options?.path ?? "/"
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  const tokenParam = options?.token ? `?preview_token=${options.token}` : ""
  return `https://${label}.${PREVIEW_BASE}${normalizedPath}${tokenParam}`
}
