/**
 * Client-side Error Logger
 *
 * Sends errors to PostHog for error tracking and analytics.
 * Use this from React components and other frontend code.
 *
 * @example
 * import { logError } from '@/lib/client-error-logger'
 *
 * try {
 *   await someOperation()
 * } catch (error) {
 *   logError('oauth', 'Failed to connect to Gmail', { error })
 * }
 */

import { captureException } from "@/components/providers/PostHogProvider"

interface ErrorDetails {
  [key: string]: unknown
}

/**
 * Log an error to PostHog
 *
 * @param category - Error category ('oauth', 'api', 'ui', etc.)
 * @param message - Human-readable error message
 * @param details - Additional structured details
 */
export async function logError(category: string, message: string, details?: ErrorDetails): Promise<void> {
  try {
    // Extract error info if details contains an Error object
    const error = details?.error instanceof Error ? details.error : new Error(message)

    // Build properties for PostHog
    const properties: Record<string, unknown> = {
      $exception_source: "client_error_logger",
      category,
      url: typeof window !== "undefined" ? window.location.href : undefined,
    }

    // Add all details except the error object, redacting sensitive keys
    if (details) {
      const sensitiveKeys = new Set([
        "password",
        "token",
        "authorization",
        "code",
        "refresh_token",
        "access_token",
        "cookie",
        "auth_code",
        "secret",
        "api_key",
        "apiKey",
      ])
      for (const [key, value] of Object.entries(details)) {
        if (key !== "error") {
          properties[key] = sensitiveKeys.has(key.toLowerCase()) ? "[redacted]" : value
        }
      }
    }

    captureException(error, properties)
  } catch {
    // Don't let error logging break the app
    console.error("[ClientErrorLogger] Failed to send error:", message, details)
  }
}

/**
 * Convenience methods for common error categories
 */
export const clientLogger = {
  oauth: (message: string, details?: ErrorDetails) => logError("oauth", message, details),
  api: (message: string, details?: ErrorDetails) => logError("api", message, details),
  ui: (message: string, details?: ErrorDetails) => logError("ui", message, details),
  integration: (message: string, details?: ErrorDetails) => logError("integration", message, details),
}

/**
 * @deprecated Global error handling is now managed by PostHogProvider.
 * This function is kept for backwards compatibility but does nothing.
 */
export function setupGlobalErrorHandler(): void {
  // PostHog provider handles global error capture automatically
  // See: components/providers/PostHogProvider.tsx
}
