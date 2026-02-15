import { z } from "zod"

/**
 * Proxy configuration for routing requests through a proxy server
 */
export const ProxySchema = z.object({
  ip: z.string(),
  port: z.string(),
  username: z.string(),
  password: z.string(),
  protocol: z.enum(["http", "https", "socks5"]),
})

/**
 * Pagination configuration for following "next page" links
 */
export const PaginationSchema = z.object({
  selector: z.string(),
  maxPages: z.number().int().min(1).max(50).default(10),
})

/**
 * Screenshot configuration
 */
export const ScreenshotSchema = z.union([
  z.boolean(),
  z.object({
    type: z.enum(["png", "webp"]).default("png"),
    fullPage: z.boolean().default(false),
  }),
])

/**
 * Request configuration schema (internal format)
 */
export const RequestSchema = z.object({
  url: z.string().url(),
  method: z.enum(["POST", "GET", "PUT", "PATCH", "DELETE"]).default("POST"),
  body: z.record(z.string(), z.unknown()).nullish(),
  headers: z.record(z.string(), z.string()).nullish(),
  timeout: z.number().nullish().default(30000),
  recordNetworkRequests: z.boolean().nullish().default(false),
  // optional origin URL to navigate to for cookie collection (useful when API is on different subdomain)
  originUrl: z.string().url().nullish(),
  // DOM features (GET only)
  waitFor: z.string().nullish(),
  extractLinks: z.boolean().default(false),
  followPagination: PaginationSchema.nullish(),
  screenshot: ScreenshotSchema.default(false),
  executeJs: z.string().nullish(),
  // Response caching (TTL in seconds, 0 = no cache)
  cache: z.number().int().min(0).nullish(),
  // Retry count on transient failures (default 2, 0 = no retry)
  retry: z.number().int().min(0).max(5).nullish(),
})

export type ProxyConfig = z.infer<typeof ProxySchema>
export type RequestConfig = z.infer<typeof RequestSchema>

/**
 * Captured network request/response pair
 */
export type NetworkRequest = {
  url: string
  method: string
  resourceType: string
  requestHeaders: Record<string, string>
  postData?: string
  response?: {
    status: number
    statusText: string
    headers: Record<string, string>
    fromCache: boolean
    fromServiceWorker: boolean
  }
  timestamp: number
}

/**
 * Extracted link from a page
 */
export type ExtractedLink = {
  href: string
  text: string
}

/**
 * Internal response format from stealthRequest
 */
export type RequestResponse = {
  success: boolean
  statusCode?: number
  statusText?: string
  responseBody?: unknown
  responseHeaders?: Record<string, string>
  error?: string
  url: string
  method: string
  format?: "html" | "links" | "screenshot"
  networkRequests?: NetworkRequest[]
}
