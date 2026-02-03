/**
 * Slug validation utilities
 * Ensures consistent slug formatting and prevents invalid deployments
 */

export function isValidSlug(slug: string): boolean {
  if (!slug || typeof slug !== "string") return false
  // 3-20 chars: lowercase letters, numbers, hyphens
  // Cannot start or end with hyphen
  return /^[a-z0-9]([a-z0-9-]{1,18}[a-z0-9])?$/.test(slug)
}

const RESERVED_SLUGS = new Set([
  "www",
  "mail",
  "admin",
  "api",
  "cdn",
  "test",
  "staging",
  "demo",
  "health",
  "status",
  "config",
  "public",
  "assets",
  "static",
  "root",
  "system",
  "localhost",
  "shell",
  "manager",
  "webhook",
  "auth",
  "login",
  "logout",
])

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase())
}

export function validateSlug(slug: string): { valid: boolean; error?: string } {
  if (!slug || typeof slug !== "string") {
    return { valid: false, error: "Slug is required" }
  }

  const trimmed = slug.toLowerCase().trim()

  if (!isValidSlug(trimmed)) {
    return {
      valid: false,
      error:
        "Slug must be 3-20 characters: lowercase letters, numbers, and hyphens only (cannot start/end with hyphen)",
    }
  }

  if (isReservedSlug(trimmed)) {
    return { valid: false, error: `Slug "${trimmed}" is reserved. Choose a different name.` }
  }

  return { valid: true }
}

export function validateSiteIdeas(ideas: string): { valid: boolean; error?: string } {
  if (!ideas || typeof ideas !== "string") {
    return { valid: false, error: "Site ideas are required" }
  }

  const trimmed = ideas.trim()

  if (trimmed.length < 10) {
    return { valid: false, error: "Site ideas must be at least 10 characters" }
  }

  if (trimmed.length > 5000) {
    return { valid: false, error: "Site ideas must be less than 5000 characters" }
  }

  return { valid: true }
}
