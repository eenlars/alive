import type { ErrorEvent } from "@sentry/nextjs"

/**
 * Server-side Sentry beforeSend filter.
 *
 * Extracted so both sentry.server.config.ts and sentry.edge.config.ts
 * use the same logic, and tests can import it directly.
 */
export function serverBeforeSend(event: ErrorEvent): ErrorEvent | null {
  if (event.environment === "local") {
    return null
  }

  // Drop SSE body stream aborts (client navigated away mid-stream).
  // Only match the specific BodyStreamBuffer message, NOT generic
  // "The operation was aborted" which can indicate real backend timeouts.
  const msg = event.exception?.values?.[0]?.value ?? ""
  if (msg.includes("BodyStreamBuffer was aborted")) {
    return null
  }

  // Strip cookies and auth headers
  if (event.request) {
    delete event.request.cookies
    if (event.request.headers) {
      delete event.request.headers.cookie
      delete event.request.headers.authorization
    }
  }
  return event
}
