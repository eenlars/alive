import type { z } from "zod"

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

/**
 * Schema definition for a single endpoint.
 * `req` is optional - omit it for GET/DELETE endpoints.
 */
export interface EndpointSchema {
  req?: z.ZodTypeAny
  res: z.ZodTypeAny
}

/**
 * Registry of all endpoint schemas.
 *
 * ```typescript
 * const schemas = {
 *   user: { res: z.object({...}) },                    // GET - no req needed
 *   login: { req: z.object({...}), res: z.object({...}) }, // POST
 * } satisfies SchemaRegistry
 * ```
 */
export type SchemaRegistry = Record<string, EndpointSchema>

/**
 * Extract endpoint names from a schema registry
 */
export type Endpoint<T extends SchemaRegistry> = keyof T & string

/**
 * Endpoints that have a request body schema (for POST/PUT/PATCH)
 */
export type MutationEndpoint<T extends SchemaRegistry> = {
  [K in keyof T]: T[K]["req"] extends z.ZodTypeAny ? K : never
}[keyof T] &
  string

/**
 * Endpoints that have NO request body schema (for GET/DELETE)
 */
export type ReadEndpoint<T extends SchemaRegistry> = {
  [K in keyof T]: T[K]["req"] extends z.ZodTypeAny ? never : K
}[keyof T] &
  string

/**
 * Extract request type for an endpoint.
 * Returns `never` if no req schema (prevents passing body to GET endpoints).
 */
export type Req<T extends SchemaRegistry, E extends Endpoint<T>> = T[E]["req"] extends z.ZodTypeAny
  ? z.infer<T[E]["req"]>
  : never

/**
 * Extract response type for an endpoint (validated output)
 */
export type Res<T extends SchemaRegistry, E extends Endpoint<T>> = z.infer<T[E]["res"]>

/**
 * Response payload type for an endpoint — what callers actually pass.
 * Strips `ok` since alrighty auto-injects `ok: true`.
 */
export type ResPayload<T extends SchemaRegistry, E extends Endpoint<T>> = Omit<Res<T, E>, "ok">

/**
 * Client configuration options
 */
export interface ClientOptions {
  /** Base path for all endpoints (default: /api) */
  basePath?: string
  /** Fetch credentials mode (default: include) */
  credentials?: RequestCredentials
  /** Default headers for all requests (e.g., auth tokens). Use Record<string, string>, not Headers instance. */
  headers?: Record<string, string>
}
