/**
 * Request URL utilities for handling reverse proxy headers
 *
 * When running behind a reverse proxy (Caddy), Next.js req.url uses localhost
 * instead of the actual public domain. These utilities construct the correct URL
 * from X-Forwarded-* headers.
 */

import type { NextRequest } from "next/server"

/**
 * Get both base URL and full URL for the request (single header parse)
 *
 * @param req - Next.js request object
 * @returns Object with baseUrl and fullUrl
 *
 * @example
 * const { baseUrl, fullUrl } = getRequestUrls(req)
 * const { searchParams } = new URL(fullUrl)
 * return NextResponse.redirect(new URL("/settings", baseUrl))
 */
export function getRequestUrls(req: NextRequest): { baseUrl: string; fullUrl: string } {
  const requestUrl = new URL(req.url)

  // Get raw headers with fallbacks to request URL values
  const rawForwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host") || requestUrl.host
  const rawForwardedProto = req.headers.get("x-forwarded-proto") || requestUrl.protocol.replace(":", "") || "https"

  // Handle multi-proxy setups where headers may be comma-separated (e.g., "https, http")
  // Take only the first value (the original client's connection)
  const forwardedHost = rawForwardedHost.split(",")[0].trim()
  const forwardedProto = rawForwardedProto.split(",")[0].trim()

  const baseUrl = `${forwardedProto}://${forwardedHost}`
  const fullUrl = `${baseUrl}${requestUrl.pathname}${requestUrl.search}`

  return { baseUrl, fullUrl }
}
