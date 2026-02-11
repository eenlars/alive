/**
 * Server Config Zod Schema — SINGLE SOURCE OF TRUTH
 *
 * Validates /var/lib/alive/server-config.json at parse time.
 * One schema, one type, one parse function. Unknown keys cause errors.
 *
 * Production shape verified against both servers (alive.best, sonno.tech).
 */

import { z } from "zod"

// ---------------------------------------------------------------------------
// Reusable validators
// ---------------------------------------------------------------------------

const pathStr = z.string().min(1)
const domainStr = z.string().regex(/^[a-z0-9.*-]+$/i)

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const serverConfigSchema = z
  .object({
    serverId: z.string().regex(/^srv_.{6,}$/),
    serverIp: z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$/),
    serverIpv6: z.string().optional(),

    paths: z
      .object({
        aliveRoot: pathStr,
        sitesRoot: pathStr,
        templatesRoot: pathStr.optional(),
        imagesStorage: pathStr,
      })
      .strict(),

    domains: z
      .object({
        main: domainStr,
        wildcard: domainStr,
        cookieDomain: z.string().min(1),
        previewBase: domainStr,
        frameAncestors: z.array(z.string().url()).optional(),
      })
      .strict(),

    urls: z
      .object({
        prod: z.string().url(),
        staging: z.string().url(),
        dev: z.string().url(),
      })
      .strict()
      .optional(),

    shell: z
      .object({
        domains: z.array(domainStr),
        listen: z.string().min(1),
        upstream: z.string().min(1),
      })
      .strict(),

    previewProxy: z
      .object({
        port: z.number().int().min(1).max(65535),
      })
      .strict()
      .optional(),

    generated: z
      .object({
        dir: pathStr,
        caddySites: pathStr,
        caddyShell: pathStr,
        nginxMap: pathStr,
      })
      .strict(),

    templates: z.record(z.string(), z.string()).optional(),
  })
  .strict()

// ---------------------------------------------------------------------------
// Derived type
// ---------------------------------------------------------------------------

export type ServerConfig = z.infer<typeof serverConfigSchema>

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Strip `_comment` keys recursively. The example file uses them for
 * documentation, but they must not reach the strict schema.
 */
function stripCommentKeys(obj: unknown): void {
  if (obj === null || typeof obj !== "object") return
  if (Array.isArray(obj)) {
    for (const item of obj) stripCommentKeys(item)
    return
  }
  const record = obj as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (key === "_comment") {
      delete record[key]
    } else {
      stripCommentKeys(record[key])
    }
  }
}

/**
 * Parse and validate raw JSON string as ServerConfig.
 * Throws a ZodError with structured issues on invalid input.
 */
export function parseServerConfig(raw: string): ServerConfig {
  const data = JSON.parse(raw)
  stripCommentKeys(data)
  return serverConfigSchema.parse(data)
}
