/**
 * Client Identification for Rate Limiting
 *
 * Extracts client IP addresses from requests, handling proxies and CDNs
 */

import type { NextRequest } from "next/server"

/**
 * Extract client IP from request headers (handles proxies/CDNs)
 *
 * @param req - Next.js request object
 * @returns IP address or 'unknown' if not available
 */
function extractClientIp(req: NextRequest): string {
  // Try to get real IP from headers (considering proxies/CDN)
  const forwardedFor = req.headers.get("x-forwarded-for")
  const realIp = req.headers.get("x-real-ip")

  // x-forwarded-for can contain multiple IPs, take the first one (client IP)
  const ip = forwardedFor?.split(",")[0]?.trim() || realIp || req.headers.get("host") || "unknown"

  return ip
}

/**
 * Generate a unique client identifier for rate limiting
 *
 * Combines a namespace prefix with the client IP to create a unique key
 * for tracking rate limits across different types of operations.
 *
 * @param req - Next.js request object
 * @param namespace - Rate limiting namespace (e.g., 'oauth:linear', 'integration:github')
 * @returns Unique client identifier string
 *
 * @example
 * const clientId = getClientIdentifier(req, 'oauth:linear')
 * // Returns: 'oauth:linear:192.168.1.1'
 */
export function getClientIdentifier(req: NextRequest, namespace: string): string {
  const ip = extractClientIp(req)
  return `${namespace}:${ip}`
}
