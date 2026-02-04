/**
 * Preview Router - Dynamic proxy for preview subdomains
 *
 * Handles all requests to *.preview.terminal.goalive.nl by:
 * 1. Extracting the subdomain (e.g., windowsxp-alive-best)
 * 2. Converting to hostname (e.g., windowsxp.alive.best)
 * 3. Looking up port from Supabase app.domains table
 * 4. Proxying to localhost:PORT
 *
 * This enables any new site to work with preview immediately,
 * without requiring manual Caddy configuration per site.
 */

import { DOMAINS, PREVIEW_MESSAGES } from "@webalive/shared"
import { type NextRequest, NextResponse } from "next/server"
import { createErrorResponse, getSessionUser, isWorkspaceAuthenticated } from "@/features/auth/lib/auth"
import { getDomainPort } from "@/lib/domains"
import { ErrorCodes } from "@/lib/error-codes"
import { previewLabelToDomain } from "@/lib/preview-utils"

// Cache port lookups for 60 seconds to reduce DB queries
const portCache = new Map<string, { port: number; expires: number }>()
const CACHE_TTL_MS = 60_000

// Script to inject for preview navigation sync (must run BEFORE React/frameworks load)
// Uses PREVIEW_MESSAGES constants interpolated into the script string
const PREVIEW_NAV_SCRIPT = `<script>
(function() {
  if (window.parent === window) return;
  function sendStart() {
    window.parent.postMessage({ type: '${PREVIEW_MESSAGES.NAVIGATION_START}' }, '*');
  }
  function sendPath() {
    window.parent.postMessage({ type: '${PREVIEW_MESSAGES.NAVIGATION}', path: location.pathname }, '*');
  }
  sendPath();
  var origPush = history.pushState, origReplace = history.replaceState;
  history.pushState = function() {
    sendStart();
    origPush.apply(this, arguments);
    sendPath();
  };
  history.replaceState = function() {
    sendStart();
    origReplace.apply(this, arguments);
    sendPath();
  };
  window.addEventListener('popstate', function() { sendStart(); sendPath(); });
  document.addEventListener('click', function(e) {
    var a = e.target.closest('a[href]');
    if (a && a.href && !a.target && a.origin === location.origin) {
      sendStart();
    }
  }, true);
  window.addEventListener('beforeunload', sendStart);
})();
</script>`

async function getCachedPort(hostname: string): Promise<number | null> {
  const cached = portCache.get(hostname)
  if (cached && cached.expires > Date.now()) {
    return cached.port
  }

  const port = await getDomainPort(hostname)
  if (port) {
    portCache.set(hostname, { port, expires: Date.now() + CACHE_TTL_MS })
  }

  return port
}

/**
 * Extract hostname from preview subdomain
 * e.g., "windowsxp-alive-best.preview.alive.best" -> "windowsxp.alive.best"
 */
function extractHostnameFromPreviewHost(host: string): string | null {
  const previewBase = DOMAINS.PREVIEW_BASE // "preview.alive.best"
  const suffix = `.${previewBase}`

  if (!host.endsWith(suffix)) {
    return null
  }

  const label = host.slice(0, -suffix.length)
  if (!label) {
    return null
  }

  return previewLabelToDomain(label)
}

async function handleProxy(request: NextRequest): Promise<NextResponse> {
  // Check authentication first
  const user = await getSessionUser()
  if (!user) {
    return createErrorResponse(ErrorCodes.UNAUTHORIZED, 401)
  }

  // Get the original host from headers (set by Caddy)
  const originalHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || ""

  // Extract hostname from preview subdomain
  const hostname = extractHostnameFromPreviewHost(originalHost)
  if (!hostname) {
    return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, { host: originalHost })
  }

  // SECURITY: Verify user has access to this workspace/hostname
  // This prevents cross-tenant preview access where any logged-in user
  // could access any preview subdomain by guessing the hostname pattern
  const hasAccess = await isWorkspaceAuthenticated(hostname)
  if (!hasAccess) {
    console.warn(`[preview-router] User ${user.id} attempted to access unauthorized hostname: ${hostname}`)
    return createErrorResponse(ErrorCodes.WORKSPACE_NOT_AUTHENTICATED, 403, { hostname })
  }

  // Look up port for this hostname
  const port = await getCachedPort(hostname)
  if (!port) {
    return createErrorResponse(ErrorCodes.WORKSPACE_NOT_FOUND, 404, { hostname })
  }

  // Build target URL
  const url = new URL(request.url)
  const targetUrl = `http://localhost:${port}${url.pathname}${url.search}`

  try {
    // Forward the request to the target
    const headers = new Headers()

    // Copy relevant headers
    const headersToCopy = [
      "accept",
      "accept-encoding",
      "accept-language",
      "cache-control",
      "content-type",
      "cookie",
      "if-modified-since",
      "if-none-match",
      "range",
      "user-agent",
    ]

    for (const header of headersToCopy) {
      const value = request.headers.get(header)
      if (value) {
        headers.set(header, value)
      }
    }

    // Set host header for Vite dev server
    headers.set("host", "localhost")
    headers.set("x-forwarded-host", hostname)
    headers.set("x-forwarded-proto", "https")
    headers.set("x-real-ip", request.headers.get("x-real-ip") || "127.0.0.1")

    // Proxy the request
    const proxyResponse = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: request.body,
      // @ts-expect-error - duplex is required for streaming request bodies
      duplex: "half",
    })

    // Build response headers
    const responseHeaders = new Headers()

    // Copy response headers
    const responseHeadersToCopy = [
      "cache-control",
      "content-type",
      "content-length",
      "content-encoding",
      "etag",
      "last-modified",
      "vary",
    ]

    for (const header of responseHeadersToCopy) {
      const value = proxyResponse.headers.get(header)
      if (value) {
        responseHeaders.set(header, value)
      }
    }

    // Security headers for iframe embedding
    responseHeaders.delete("x-frame-options")
    responseHeaders.set(
      "content-security-policy",
      `frame-ancestors ${DOMAINS.STREAM_DEV} ${DOMAINS.STREAM_PROD} ${DOMAINS.STREAM_STAGING}`,
    )

    // Inject navigation script into HTML responses (at <head> to run before frameworks)
    const contentType = proxyResponse.headers.get("content-type") || ""
    console.log("[preview-router] Content-Type:", contentType, "URL:", url.pathname)
    if (contentType.includes("text/html")) {
      const html = await proxyResponse.text()
      console.log("[preview-router] HTML length:", html.length, "Has <head>:", html.includes("<head>"))
      // Inject right after <head> so it runs before any framework JS
      const injectedHtml = html.replace(/<head>/i, `<head>${PREVIEW_NAV_SCRIPT}`)
      console.log("[preview-router] Injected:", injectedHtml.includes(PREVIEW_MESSAGES.NAVIGATION))
      responseHeaders.delete("content-length") // Length changed
      responseHeaders.delete("content-encoding") // We decoded it
      return new NextResponse(injectedHtml, {
        status: proxyResponse.status,
        statusText: proxyResponse.statusText,
        headers: responseHeaders,
      })
    }

    return new NextResponse(proxyResponse.body, {
      status: proxyResponse.status,
      statusText: proxyResponse.statusText,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error("[preview-router] Proxy error:", error)
    return createErrorResponse(ErrorCodes.QUERY_FAILED, 502, {
      hostname,
      port,
      details: error instanceof Error ? error.message : "Unknown error",
    })
  }
}

// Handle all HTTP methods
export const GET = handleProxy
export const POST = handleProxy
export const PUT = handleProxy
export const DELETE = handleProxy
export const PATCH = handleProxy
export const HEAD = handleProxy
export const OPTIONS = handleProxy
