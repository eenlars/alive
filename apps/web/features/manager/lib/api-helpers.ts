/**
 * API response helpers for manager routes
 * DRY refactor: Consolidates repeated authentication and error patterns
 */

import { type NextRequest, NextResponse } from "next/server"
import { isManagerAuthenticated } from "@/features/auth/lib/auth"

// ============================================================================
// Response Creators (Base helpers)
// ============================================================================

/**
 * Create a success response with data
 *
 * @param data - Response data
 * @param statusCode - HTTP status code (default: 200)
 *
 * @example
 * return createSuccessResponse({ result: data })
 */
export function createSuccessResponse(data: Record<string, unknown>, statusCode: number = 200): Response {
  return NextResponse.json({ ok: true, ...data }, { status: statusCode })
}

/**
 * Create a 400 Bad Request response
 *
 * @param message - Error message
 *
 * @example
 * return createBadRequestResponse("Invalid parameters")
 */
export function createBadRequestResponse(message: string): Response {
  return NextResponse.json({ error: message }, { status: 400 })
}

/**
 * Create a 401 Unauthorized response
 *
 * @param message - Error message (default: "Unauthorized")
 *
 * @example
 * return createUnauthorizedResponse()
 */
export function createUnauthorizedResponse(message: string = "Unauthorized"): Response {
  return NextResponse.json({ error: message }, { status: 401 })
}

/**
 * Create a 404 Not Found response
 *
 * @param resource - Resource that was not found
 *
 * @example
 * return createNotFoundResponse("Domain")
 */
export function createNotFoundResponse(resource: string): Response {
  return NextResponse.json({ error: `${resource} not found` }, { status: 404 })
}

/**
 * Create error response from caught error
 *
 * @param error - The caught error
 * @param defaultMessage - Fallback message if error has no message
 * @param statusCode - HTTP status code (default: 500)
 *
 * @example
 * } catch (error) {
 *   return createErrorResponse(error, "Operation failed")
 * }
 */
export function createErrorResponse(error: unknown, defaultMessage: string, statusCode: number = 500): Response {
  const message = error instanceof Error ? error.message : defaultMessage
  return NextResponse.json({ error: message }, { status: statusCode })
}

// ============================================================================
// Request Validators (Use base helpers)
// ============================================================================

/**
 * Check manager authentication and return error response if not authenticated
 *
 * @returns null if authenticated, error Response if not
 *
 * @example
 * const authError = await requireManagerAuth()
 * if (authError) return authError
 */
export async function requireManagerAuth(): Promise<Response | null> {
  const isAuth = await isManagerAuthenticated()
  if (!isAuth) {
    return createUnauthorizedResponse()
  }
  return null
}

/**
 * Validate required parameter from request and return error response if missing
 *
 * @param value - The parameter value
 * @param paramName - Name of the parameter (for error message)
 * @returns null if valid, error Response if missing
 *
 * @example
 * const domainError = requireParam(domain, "domain")
 * if (domainError) return domainError
 */
export function requireParam(value: string | null | undefined, paramName: string): Response | null {
  if (!value) {
    return createBadRequestResponse(`${paramName.charAt(0).toUpperCase() + paramName.slice(1)} parameter required`)
  }
  return null
}

// ============================================================================
// Request Extractors
// ============================================================================

/**
 * Extract domain parameter from GET request query string
 *
 * @param request - Next.js request object
 * @returns domain string or null if not present
 */
export function getDomainParam(request: NextRequest): string | null {
  return request.nextUrl.searchParams.get("domain")
}

/**
 * Extract domain from POST request body
 *
 * @param body - Parsed request body
 * @returns domain string or null if not present
 */
export function getDomainFromBody(body: { domain?: string }): string | null {
  return body.domain ?? null
}
