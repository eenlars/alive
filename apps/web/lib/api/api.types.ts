/**
 * @deprecated This file re-exports types for backward compatibility.
 * New code should import directly from '@/lib/api/schemas' instead.
 *
 * Migration guide:
 *   ❌ import { type Endpoint, type Req, type Res } from '@/lib/api/api.types'
 *   ✅ import { type Endpoint, type Req, type Res } from '@/lib/api/schemas'
 *
 * This file will be removed in a future version.
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
