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
  networkRequests?: NetworkRequest[]
}
