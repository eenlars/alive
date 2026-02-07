/**
 * API client-specific shared types.
 * Endpoint/Req/Res are re-exported from schemas for convenience.
 */
import type { Endpoint, Req, Res } from "@/lib/api/schemas"

export type { Endpoint, Req, Res }

/**
 * Default path mapping: /api/<endpoint>
 * Override if any endpoint lives elsewhere.
 * For dynamic routes, use the pathParams to replace placeholders
 */
export const endpointPath = <E extends Endpoint>(endpoint: E) => {
  const endpointStr = String(endpoint)
  return endpointStr.startsWith("/") ? `/api${endpointStr}` : `/api/${endpointStr}`
}

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export interface ApiInit<E extends Endpoint> extends Omit<RequestInit, "body" | "method"> {
  method?: Method
  body?: Req<E>
}

export type PathOverride = string | undefined // e.g. /api/call-status/123
