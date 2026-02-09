import { DEFAULTS } from "@webalive/shared"
import { z } from "zod"

/**
 * Reserved slugs that cannot be used for deployments
 * These conflict with system routes or common infrastructure paths
 *
 * EXPORTED: Tests can import this to verify reserved slug behavior
 */
export const RESERVED_SLUGS = [
  "api",
  "admin",
  "www",
  "mail",
  "ftp",
  "smtp",
  "pop",
  "imap",
  "localhost",
  "webmail",
  "cpanel",
  "whm",
  "blog",
  "forum",
  "shop",
  "store",
  "cdn",
  "static",
  "assets",
  "media",
  "files",
  "download",
  "uploads",
  "test",
  "staging",
  "dev",
  "demo",
  "docs",
  "help",
  "support",
  "status",
  "health",
  "ping",
  "metrics",
  "webhook",
  "callback",
] as const

/**
 * Deploy Subdomain Request Schema
 *
 * Requires an authenticated user session.
 */
export const DeploySubdomainSchema = z
  .object({
    slug: z
      .string()
      .min(3, "Slug must be at least 3 characters")
      .max(20, "Slug must be no more than 20 characters")
      .regex(/^[a-z0-9]([a-z0-9-]{1,18}[a-z0-9])?$/, "Slug must be lowercase letters, numbers, and hyphens only")
      .refine(slug => !RESERVED_SLUGS.includes(slug as any), {
        message: "This slug is reserved and cannot be used. Please choose a different name.",
      }),
    orgId: z.string().min(1, "Organization ID cannot be empty").optional(), // Optional: If not provided, user's default org is created/used
    siteIdeas: z
      .string()
      .max(5000, "Site ideas must be less than 5000 characters")
      .transform(val => val || "")
      .optional()
      .default(""),
    templateId: z
      .string()
      .refine(val => val.startsWith(DEFAULTS.TEMPLATE_ID_PREFIX), {
        message: `Template ID must start with '${DEFAULTS.TEMPLATE_ID_PREFIX}'`,
      })
      .optional(),
  })
  .strict()

export type DeploySubdomainRequest = z.infer<typeof DeploySubdomainSchema>

export function validateDeploySubdomainRequest(body: unknown) {
  return DeploySubdomainSchema.safeParse(body)
}

export function isValidDeploySubdomainRequest(body: unknown): body is DeploySubdomainRequest {
  return DeploySubdomainSchema.safeParse(body).success
}
