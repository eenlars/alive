import { tool } from "@anthropic-ai/claude-agent-sdk"
import { DEFAULTS, getTemplateIdsInline, getTemplateListForDocs } from "@webalive/shared"
import { z } from "zod"
import { callBridgeApi, errorResult, type ToolResult } from "../../lib/api-client.js"

// Reserved slugs that cannot be used (mirrors server-side validation)
const RESERVED_SLUGS = [
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

export const createWebsiteParamsSchema = {
  slug: z
    .string()
    .min(3, "Slug must be at least 3 characters")
    .max(16, "Slug must be no more than 16 characters")
    .regex(
      /^[a-z0-9]([a-z0-9-]{1,14}[a-z0-9])?$/,
      "Slug must start and end with a letter or number, and contain only lowercase letters, numbers, and hyphens",
    )
    .refine(slug => !RESERVED_SLUGS.includes(slug as (typeof RESERVED_SLUGS)[number]), {
      message: "This slug is reserved. Please choose a different name.",
    })
    .describe(
      `The subdomain name for the website (e.g., 'my-bakery' creates my-bakery.${DEFAULTS.WILDCARD_DOMAIN}). Must be 3-16 characters, lowercase letters, numbers, and hyphens only.`,
    ),
  siteIdeas: z
    .string()
    .max(5000, "Site ideas must be less than 5000 characters")
    .optional()
    .describe(
      "Optional description of what the website should be about. This helps guide the initial design and content.",
    ),
  templateId: z
    .string()
    .optional()
    .describe(
      "Optional template ID to use (e.g., 'tmpl_blank', 'tmpl_gallery'). If not provided, uses the default blank template.",
    ),
}

export type CreateWebsiteParams = {
  slug: string
  siteIdeas?: string
  templateId?: string
}

/**
 * Create a new website using the Bridge deployment API.
 *
 * This tool calls the /api/deploy-subdomain endpoint which handles:
 * - DNS validation
 * - Port assignment
 * - System user creation
 * - Filesystem setup
 * - Site building
 * - Systemd service creation
 * - Caddy reverse proxy configuration
 * - SSL certificate provisioning
 *
 * The deployment uses the authenticated user's session from ALIVE_SESSION_COOKIE.
 */
export async function createWebsite(params: CreateWebsiteParams): Promise<ToolResult> {
  const { slug, siteIdeas, templateId } = params

  // Default to blank template if not specified
  const finalTemplateId = templateId || DEFAULTS.DEFAULT_TEMPLATE_ID

  // Validate template ID prefix
  if (!finalTemplateId.startsWith(DEFAULTS.TEMPLATE_ID_PREFIX)) {
    return errorResult(
      "Invalid template ID",
      `Template ID must start with '${DEFAULTS.TEMPLATE_ID_PREFIX}'. Got: ${finalTemplateId}. Available templates: ${getTemplateIdsInline()}`,
    )
  }

  try {
    const result = await callBridgeApi({
      endpoint: "/api/deploy-subdomain",
      method: "POST",
      body: {
        slug,
        siteIdeas: siteIdeas || "",
        templateId: finalTemplateId,
      },
      timeout: 120000, // 2 minutes - deployment can take time
    })

    // Enhance success message with useful info
    if (!result.isError) {
      const domain = `${slug}.${DEFAULTS.WILDCARD_DOMAIN}`
      return {
        content: [
          {
            type: "text",
            text: `Website created successfully!

**Domain:** https://${domain}
**Chat URL:** /chat?slug=${slug}

The site is now live and ready to edit. You can start customizing it right away.`,
          },
        ],
        isError: false,
      }
    }

    return result
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return errorResult("Failed to create website", errorMessage)
  }
}

// Build description dynamically from template source of truth
const TOOL_DESCRIPTION = `Create a new website with automatic deployment.

Creates a fully configured website with:
- Custom subdomain (e.g., my-site.${DEFAULTS.WILDCARD_DOMAIN})
- SSL certificate (automatic HTTPS)
- Dev server with hot reload
- Production build capability

**Usage:**
- Provide a unique slug (3-16 chars, lowercase, letters/numbers/hyphens)
- Optionally describe what the site should be about
- Optionally specify a template

**Templates:**
${getTemplateListForDocs(DEFAULTS.DEFAULT_TEMPLATE_ID)}

**Example:**
create_website({ slug: "my-bakery", siteIdeas: "A website for a local bakery with menu, location, and contact info" })`

export const createWebsiteTool = tool("create_website", TOOL_DESCRIPTION, createWebsiteParamsSchema, async args => {
  return createWebsite(args)
})
