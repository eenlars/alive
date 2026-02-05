/**
 * Tests for request URL utilities
 */

import { DOMAINS, PORTS } from "@webalive/shared"
import type { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"
import { getRequestUrls } from "./request-url"

// In CI, server-config.json doesn't exist so DOMAINS return empty strings
const hasServerConfig = !process.env.CI

// Use constants for test URLs
const DEV_BASE_URL = `http://localhost:${PORTS.DEV}`

// Mock NextRequest helper
function createMockRequest(url: string, headers: Record<string, string>): NextRequest {
  return {
    url,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] || null,
    },
  } as unknown as NextRequest
}

describe("getRequestUrls", () => {
  // Tests using DOMAINS.STREAM_* require server config (not available in CI)
  it.skipIf(!hasServerConfig)("should return both baseUrl and fullUrl with correct domain from proxy headers", () => {
    const req = createMockRequest(`${DEV_BASE_URL}/api/auth/linear?code=abc123`, {
      "x-forwarded-host": DOMAINS.STREAM_DEV_HOST,
      "x-forwarded-proto": "https",
      host: `localhost:${PORTS.DEV}`,
    })

    const { baseUrl, fullUrl } = getRequestUrls(req)
    expect(baseUrl).toBe(DOMAINS.STREAM_DEV)
    expect(fullUrl).toBe(`${DOMAINS.STREAM_DEV}/api/auth/linear?code=abc123`)
  })

  it("should fall back to host header if x-forwarded-host is missing", () => {
    const req = createMockRequest(`${DEV_BASE_URL}/api/auth/linear`, {
      host: "example.com",
      "x-forwarded-proto": "https",
    })

    const { baseUrl, fullUrl } = getRequestUrls(req)
    expect(baseUrl).toBe("https://example.com")
    expect(fullUrl).toBe("https://example.com/api/auth/linear")
  })

  it("should fall back to request URL protocol if x-forwarded-proto is missing", () => {
    const req = createMockRequest(`${DEV_BASE_URL}/api/auth/linear`, {
      host: "example.com",
    })

    const { baseUrl } = getRequestUrls(req)
    // Falls back to requestUrl.protocol ("http") when x-forwarded-proto is missing
    expect(baseUrl).toBe("http://example.com")
  })

  it.skipIf(!hasServerConfig)("should preserve query parameters in fullUrl", () => {
    const req = createMockRequest(`${DEV_BASE_URL}/settings?status=error&message=test`, {
      "x-forwarded-host": DOMAINS.STREAM_PROD_HOST,
      "x-forwarded-proto": "https",
    })

    const { fullUrl } = getRequestUrls(req)
    expect(fullUrl).toBe(`${DOMAINS.STREAM_PROD}/settings?status=error&message=test`)
  })

  it.skipIf(!hasServerConfig)("should work without query parameters", () => {
    const req = createMockRequest(`${DEV_BASE_URL}/api/login`, {
      "x-forwarded-host": DOMAINS.STREAM_PROD_HOST,
      "x-forwarded-proto": "https",
    })

    const { fullUrl } = getRequestUrls(req)
    expect(fullUrl).toBe(`${DOMAINS.STREAM_PROD}/api/login`)
  })

  it("should parse headers only once (performance test)", () => {
    const req = createMockRequest(`${DEV_BASE_URL}/api/test`, {
      "x-forwarded-host": "example.com",
      "x-forwarded-proto": "https",
    })

    // Single call returns both values
    const { baseUrl, fullUrl } = getRequestUrls(req)
    expect(baseUrl).toBe("https://example.com")
    expect(fullUrl).toBe("https://example.com/api/test")
  })
})
