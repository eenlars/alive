/**
 * Domain normalization utilities for consistent domain handling
 */

import { PATHS } from "@webalive/shared"

/**
 * Normalizes a domain name by:
 * - Converting to lowercase
 * - Removing protocol (http://, https://)
 * - Removing www. prefix
 * - Removing trailing slashes and paths
 * - Removing port numbers
 * - Trimming whitespace
 */
export function normalizeDomain(input: string): string {
  if (!input || typeof input !== "string") {
    return ""
  }

  let domain = input.trim()

  // Remove protocol (http://, https://, ftp://, etc.)
  domain = domain.replace(/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//, "")

  // Remove www. prefix (case insensitive)
  domain = domain.replace(/^www\./i, "")

  // Remove trailing slashes and everything after
  domain = domain.replace(/\/.*$/, "")

  // Remove port numbers
  domain = domain.replace(/:\d+$/, "")

  // Remove query strings and anchors
  domain = domain.replace(/[?#].*$/, "")

  // Convert to lowercase
  domain = domain.toLowerCase()

  // Final trim
  domain = domain.trim()

  return domain
}

/**
 * Validates if a domain is in a valid format
 */
export function isValidDomain(domain: string): boolean {
  if (!domain) return false

  // Basic domain regex - allows letters, numbers, hyphens, and dots
  // Must have at least one dot and valid TLD
  const domainRegex =
    /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/

  return domainRegex.test(domain)
}

/**
 * Normalizes and validates a domain in one step
 */
export function normalizeAndValidateDomain(input: string): { domain: string; isValid: boolean; error?: string } {
  const normalized = normalizeDomain(input)

  if (!normalized) {
    return { domain: "", isValid: false, error: "Domain is required" }
  }

  if (!isValidDomain(normalized)) {
    return { domain: normalized, isValid: false, error: "Invalid domain format (e.g., example.com)" }
  }

  return { domain: normalized, isValid: true }
}

/**
 * Convert domain to slug format (for systemd service names, user names, etc.)
 * Replaces all non-alphanumeric characters with hyphens
 *
 * @example
 * domainToSlug("example.com") // "example-com"
 * domainToSlug("sub.example.com") // "sub-example-com"
 */
export function domainToSlug(domain: string): string {
  return domain.replace(/[^a-zA-Z0-9]/g, "-")
}

/**
 * Get expected system user name for a domain
 * @example
 * getDomainUser("example.com") // "site-example-com"
 */
export function getDomainUser(domain: string): string {
  return `site-${domainToSlug(domain)}`
}

/**
 * Get site directory path for a domain
 * @example
 * getDomainSitePath("example.com") // "/srv/webalive/sites/example.com"
 */
export function getDomainSitePath(domain: string): string {
  return `${PATHS.SITES_ROOT}/${domain}`
}
