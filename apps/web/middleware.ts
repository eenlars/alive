/**
 * Next.js Middleware — Request ID tracing for /api/*
 *
 * Guarantees every API response carries X-Request-Id.
 * - Preserves an incoming X-Request-Id if the caller supplies one.
 * - Generates a new UUIDv4 otherwise.
 * - Exposes the header to browser JS via Access-Control-Expose-Headers.
 */

import { type NextRequest, NextResponse } from "next/server"
import { generateRequestId, REQUEST_ID_HEADER } from "@/lib/request-id"

export function middleware(request: NextRequest) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) || generateRequestId()

  // Forward the ID to route handlers via a modified request header.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(REQUEST_ID_HEADER, requestId)

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  })

  // Attach to the outgoing response so clients can correlate.
  response.headers.set(REQUEST_ID_HEADER, requestId)

  // Merge with any existing expose list so we don't clobber other headers.
  const existing = response.headers.get("access-control-expose-headers")
  const exposeValue = existing ? `${existing}, X-Request-Id` : "X-Request-Id"
  response.headers.set("Access-Control-Expose-Headers", exposeValue)

  return response
}

export const config = {
  matcher: "/api/:path*",
}
