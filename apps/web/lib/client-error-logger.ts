/**
 * Client-side Error Logger
 *
 * Sends errors to the centralized error logging API.
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

interface ErrorDetails {
  [key: string]: unknown
}

/**
 * Log an error to the centralized error API
 *
 * @param category - Error category ('oauth', 'api', 'ui', etc.)
 * @param message - Human-readable error message
 * @param details - Additional structured details
 */
export async function logError(category: string, message: string, details?: ErrorDetails): Promise<void> {
  try {
    // Extract error info if details contains an Error object
    const processedDetails: ErrorDetails = { ...details }
    if (details?.error instanceof Error) {
      processedDetails.errorMessage = details.error.message
      processedDetails.errorStack = details.error.stack
      delete processedDetails.error
    }

    await fetch("/api/logs/error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        category,
        message,
        details: processedDetails,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        stack: details?.error instanceof Error ? details.error.stack : undefined,
      }),
    })
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
 * Global error handler setup (call once in app layout)
 */
export function setupGlobalErrorHandler(): void {
  if (typeof window === "undefined") return

  // Catch unhandled promise rejections
  window.addEventListener("unhandledrejection", event => {
    logError("unhandled", `Unhandled rejection: ${event.reason?.message || event.reason}`, {
      error: event.reason,
    })
  })

  // Catch runtime errors
  window.addEventListener("error", event => {
    logError("runtime", `Runtime error: ${event.message}`, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error,
    })
  })
}
