/**
 * Toast Message Validation
 *
 * Validates OAuth callback parameters before displaying in toasts
 * Prevents XSS and misleading notifications
 */

import { isOAuthProviderSupported } from "@/lib/oauth/providers"

/**
 * Valid OAuth callback status values
 */
const VALID_STATUSES = ["success", "error"] as const
type OAuthStatus = (typeof VALID_STATUSES)[number]

/**
 * Sanitize provider name for display
 * - Validates against known providers
 * - Prevents XSS by escaping HTML entities
 * - Returns safe string or null if invalid
 */
function sanitizeProviderForDisplay(provider: unknown): string | null {
  if (typeof provider !== "string" || provider.length === 0) {
    return null
  }

  const normalized = provider.toLowerCase().trim()

  // Check against known OAuth providers
  if (!isOAuthProviderSupported(normalized)) {
    return null
  }

  // Escape HTML entities (defense in depth - React already escapes, but be explicit)
  const escaped = normalized.replace(/[&<>"']/g, char => {
    switch (char) {
      case "&":
        return "&amp;"
      case "<":
        return "&lt;"
      case ">":
        return "&gt;"
      case '"':
        return "&quot;"
      case "'":
        return "&#39;"
      default:
        return char
    }
  })

  return escaped
}

/**
 * Sanitize message for display
 * - Removes potentially dangerous content
 * - Truncates excessively long messages
 * - Returns safe string or default message
 */
function sanitizeMessageForDisplay(message: unknown, defaultMessage: string): string {
  if (typeof message !== "string" || message.length === 0) {
    return defaultMessage
  }

  // Truncate to reasonable length to prevent toast overflow
  const maxLength = 200
  let sanitized = message.trim()

  if (sanitized.length > maxLength) {
    sanitized = `${sanitized.substring(0, maxLength)}...`
  }

  // Escape HTML entities
  sanitized = sanitized.replace(/[&<>"']/g, char => {
    switch (char) {
      case "&":
        return "&amp;"
      case "<":
        return "&lt;"
      case ">":
        return "&gt;"
      case '"':
        return "&quot;"
      case "'":
        return "&#39;"
      default:
        return char
    }
  })

  return sanitized
}

/**
 * Validate and sanitize OAuth callback parameters
 *
 * @param params - URL search params from OAuth callback
 * @returns Validated parameters or null if invalid
 *
 * @example
 * const validated = validateOAuthToastParams(new URLSearchParams(window.location.search))
 * if (validated) {
 *   if (validated.status === 'success') {
 *     toast.success(validated.successMessage)
 *   } else {
 *     toast.error(validated.errorMessage)
 *   }
 * }
 */
export function validateOAuthToastParams(params: URLSearchParams): {
  status: OAuthStatus
  provider: string
  successMessage?: string
  errorMessage?: string
} | null {
  const integration = params.get("integration")
  const status = params.get("status")
  const message = params.get("message")

  // Validate provider
  const sanitizedProvider = sanitizeProviderForDisplay(integration)
  if (!sanitizedProvider) {
    console.warn("[Toast Validation] Invalid provider:", integration)
    return null
  }

  // Validate status
  if (!status || !VALID_STATUSES.includes(status as OAuthStatus)) {
    console.warn("[Toast Validation] Invalid status:", status)
    return null
  }

  const validatedStatus = status as OAuthStatus

  if (validatedStatus === "success") {
    return {
      status: "success",
      provider: sanitizedProvider,
      successMessage: `Successfully connected to ${sanitizedProvider}!`,
    }
  }

  // Error case: sanitize the message
  const defaultErrorMessage = `Failed to connect to ${sanitizedProvider}`
  const sanitizedMessage = sanitizeMessageForDisplay(message, defaultErrorMessage)

  return {
    status: "error",
    provider: sanitizedProvider,
    errorMessage: sanitizedMessage,
  }
}
