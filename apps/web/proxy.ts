/**
 * Next.js Proxy - Preview subdomain routing
 *
 * Detects requests from preview subdomains (preview--{label}.{WILDCARD}) and
 * internally rewrites them to /api/preview-router/... which handles
 * authentication, port lookup, and proxying to the correct site.
 *
 * Single-level subdomain pattern stays under *.WILDCARD_DOMAIN,
 * which Cloudflare Universal SSL covers. Domain-agnostic.
 *
 * Flow:
 * 1. Browser requests https://preview--foo-sonno-tech.sonno.tech/about
 * 2. Caddy *.sonno.tech catch-all forwards to Next.js
 * 3. This proxy detects the preview-- prefix and rewrites to /api/preview-router/about
 * 4. Preview-router extracts hostname, checks auth, looks up port, and proxies
 */

import { type NextRequest, NextResponse } from "next/server"

const PREVIEW_PREFIX = "preview--"

export function proxy(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || ""

  // Check if this is a preview subdomain request (starts with "preview--")
  // Skip paths already rewritten to /api/preview-router to prevent double-rewrite
  if (host.startsWith(PREVIEW_PREFIX) && !request.nextUrl.pathname.startsWith("/api/preview-router")) {
    // Internal rewrite to preview-router (no redirect, preserves original URL)
    const url = request.nextUrl.clone()
    url.pathname = `/api/preview-router${url.pathname}`
    return NextResponse.rewrite(url)
  }

  return NextResponse.next()
}

export const config = {
  // Match all paths EXCEPT Next.js internals and static files
  matcher: ["/((?!_next/static|_next/image).*)"],
}
