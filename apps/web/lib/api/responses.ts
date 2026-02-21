/**
 * API Response Helpers
 *
 * Standardized response builders for API routes.
 * Use these instead of manually creating NextResponse objects.
 */

import { NextResponse } from "next/server"
import { addCorsHeaders } from "@/lib/cors-utils"
import { type ErrorCode, getErrorMessage, type StructuredError } from "@/lib/error-codes"
import type { OrganizationsResponse, WorkspacesResponse } from "./types"

interface ResponseOptions {
  origin?: string | null
  status?: number
}

/**
 * Create a JSON response with CORS headers
 */
function jsonResponse<T>(data: T, options: ResponseOptions = {}): NextResponse {
  const { origin, status = 200 } = options
  const response = NextResponse.json(data, { status })

  // Add CORS headers if origin provided
  if (origin) {
    addCorsHeaders(response, origin)
  }

  return response
}

/**
 * Create an error response with ErrorCode
 * Automatically generates user-friendly message from error code
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function structuredErrorResponse(
  errorCode: ErrorCode,
  options: ResponseOptions & { status: number; details?: Record<string, any> },
): NextResponse {
  const { details = {} } = options
  const errorData: StructuredError = {
    ok: false,
    error: errorCode,
    message: getErrorMessage(errorCode, details),
    details: Object.keys(details).length > 0 ? details : undefined,
  }
  return jsonResponse(errorData, options)
}

/**
 * Create an organizations success response
 */
export function organizationsResponse(
  organizations: OrganizationsResponse["organizations"],
  currentUserId: string,
  options: ResponseOptions = {},
): NextResponse {
  const data: OrganizationsResponse = {
    ok: true,
    organizations,
    current_user_id: currentUserId,
  }
  return jsonResponse(data, options)
}

/**
 * Create a workspaces success response
 */
export function workspacesResponse(workspaces: string[], options: ResponseOptions = {}): NextResponse {
  const data: WorkspacesResponse = {
    ok: true,
    workspaces,
  }
  return jsonResponse(data, options)
}

/**
 * Simplified CORS response helpers for common patterns
 * These always add CORS headers (unlike jsonResponse which is optional)
 */

/**
 * Create a JSON response with CORS headers (always applied)
 *
 * @param origin - The request origin for CORS headers
 * @param data - The data to return in the response
 * @param status - HTTP status code (default: 200)
 * @returns NextResponse with CORS headers
 * @example
 * return createCorsResponse(origin, { ok: true, data: [...] }, 200)
 */
export function createCorsResponse(origin: string | null, data: unknown, status = 200): NextResponse {
  const res = NextResponse.json(data, { status })
  addCorsHeaders(res, origin)
  return res
}

/**
 * Create an error JSON response with CORS headers (always applied)
 *
 * Similar to structuredErrorResponse but always includes CORS headers and
 * spreads fields at root level (requestId at root, not nested under details).
 *
 * @param origin - The request origin for CORS headers
 * @param error - The error code
 * @param status - HTTP status code
 * @param fields - Additional fields to include in the response (e.g., requestId, details)
 * @returns NextResponse with error and CORS headers
 * @example
 * return createCorsErrorResponse(origin, ErrorCodes.UNAUTHORIZED, 401, { requestId })
 * return createCorsErrorResponse(origin, ErrorCodes.INVALID_REQUEST, 400, { requestId, details: { issues } })
 */
export function createCorsErrorResponse(
  origin: string | null,
  error: ErrorCode,
  status: number,
  fields?: { requestId?: string; details?: unknown },
): NextResponse {
  const res = NextResponse.json(
    {
      ok: false,
      error,
      message: getErrorMessage(error),
      ...fields,
    },
    { status },
  )
  addCorsHeaders(res, origin)
  return res
}

/**
 * Create a success JSON response with CORS headers (always applied)
 *
 * @param origin - The request origin for CORS headers
 * @param data - The data to return (will be wrapped in { ok: true, ...data })
 * @param status - HTTP status code (default: 200)
 * @returns NextResponse with success response and CORS headers
 * @example
 * return createCorsSuccessResponse(origin, { users: [...] })
 * // Returns: { ok: true, users: [...] }
 */
export function createCorsSuccessResponse(
  origin: string | null,
  data: Record<string, unknown>,
  status = 200,
): NextResponse {
  return createCorsResponse(origin, { ok: true, ...data }, status)
}
