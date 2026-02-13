import { stealthRequest } from "./index"
import { StealthResponse } from "./StealthResponse"
import type { ProxyConfig, RequestConfig } from "./types"

/**
 * Options for stealthFetch that extend standard RequestInit
 */
export interface StealthFetchOptions extends RequestInit {
  proxy?: ProxyConfig
  timeout?: number
  recordNetworkRequests?: boolean
  // optional origin URL to navigate to for cookie collection (useful when API is on different subdomain)
  originUrl?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Parse body from various formats to JSON-serializable object
 */
function parseBody(body: BodyInit | null | undefined): Record<string, unknown> | undefined {
  if (!body) return undefined

  if (typeof body === "string") {
    try {
      const parsed: unknown = JSON.parse(body)
      if (isRecord(parsed)) {
        return parsed
      }
      return { data: parsed }
    } catch {
      return { data: body }
    }
  }

  if (body instanceof URLSearchParams) {
    return Object.fromEntries(body.entries())
  }

  if (body instanceof FormData) {
    const obj: Record<string, FormDataEntryValue> = {}
    body.forEach((value, key) => {
      obj[key] = value
    })
    return obj
  }

  // For ArrayBuffer, decode and wrap
  if (body instanceof ArrayBuffer) {
    return { data: new TextDecoder().decode(body) }
  }

  return undefined
}

/**
 * Drop-in replacement for native fetch() that uses puppeteer with stealth plugin
 *
 * @param input - URL string or URL object
 * @param init - Optional fetch configuration (same as native fetch)
 * @returns Promise<StealthResponse> - Response-like object
 *
 * @example
 * ```typescript
 * const response = await stealthFetch('https://example.com')
 * const html = await response.text()
 *
 * const jsonResponse = await stealthFetch('https://api.example.com/data', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ key: 'value' })
 * })
 * const data = await jsonResponse.json()
 * ```
 */
export async function stealthFetch(input: string | URL, init?: StealthFetchOptions): Promise<StealthResponse> {
  const url = typeof input === "string" ? input : input.toString()

  // Extract headers
  const headers: Record<string, string> = {}
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => {
        headers[key] = value
      })
    } else if (Array.isArray(init.headers)) {
      init.headers.forEach(([key, value]) => {
        headers[key] = value
      })
    } else {
      // HeadersInit object type
      for (const [key, value] of Object.entries(init.headers)) {
        headers[key] = value
      }
    }
  }

  // Build request config
  type HttpMethod = "POST" | "GET" | "PUT" | "PATCH" | "DELETE"
  const methodMap: Record<string, HttpMethod> = {
    POST: "POST",
    GET: "GET",
    PUT: "PUT",
    PATCH: "PATCH",
    DELETE: "DELETE",
  }
  const method = init?.method?.toUpperCase() ?? "GET"

  const requestConfig: RequestConfig = {
    url,
    method: methodMap[method] ?? "GET",
    headers,
    body: parseBody(init?.body),
    timeout: init?.timeout ?? null,
    recordNetworkRequests: init?.recordNetworkRequests ?? false,
    originUrl: init?.originUrl ?? null,
  }

  // Make the stealth request
  const result = await stealthRequest(requestConfig, init?.proxy)

  // Return response-like object
  return new StealthResponse(
    typeof result.responseBody === "string" ? result.responseBody : JSON.stringify(result.responseBody),
    {
      status: result.statusCode ?? (result.success ? 200 : 500),
      statusText: result.statusText ?? (result.success ? "OK" : (result.error ?? "Error")),
      headers: result.responseHeaders || {},
      url: result.url,
      networkRequests: result.networkRequests,
    },
  )
}
