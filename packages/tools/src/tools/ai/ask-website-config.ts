/**
 * Ask Website Config Tool
 *
 * Presents an interactive form to configure a new website deployment.
 * Returns structured data that the frontend renders as a multi-step form.
 *
 * The user can:
 * 1. Choose a subdomain slug
 * 2. Select a template
 * 3. Optionally describe what the site is about
 *
 * After submission, their choices are sent back to Claude to trigger deployment.
 */

import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"
import { TEMPLATES } from "@webalive/shared"

export const askWebsiteConfigParamsSchema = {
  context: z.string().optional().describe("Optional context about why a website is being created"),
  defaultSlug: z.string().optional().describe("Optional default slug to pre-fill"),
}

export type AskWebsiteConfigParams = {
  context?: string
  defaultSlug?: string
}

export interface AskWebsiteConfigResult {
  content: Array<{ type: "text"; text: string }>
  isError: boolean
  [key: string]: unknown
}

/**
 * Show the website configuration form to the user.
 *
 * Returns JSON that the frontend renders as an interactive multi-step form.
 * When the user submits their configuration, it's sent back to Claude as a message.
 */
export async function askWebsiteConfig(params: AskWebsiteConfigParams): Promise<AskWebsiteConfigResult> {
  try {
    const { context, defaultSlug } = params

    const responseData = {
      type: "website_config",
      templates: TEMPLATES,
      defaultSlug,
      context,
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(responseData),
        },
      ],
      isError: false,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    return {
      content: [
        {
          type: "text",
          text: `Error creating website config form: ${errorMessage}`,
        },
      ],
      isError: true,
    }
  }
}

export const askWebsiteConfigTool = tool(
  "ask_website_config",
  `Show an interactive form for the user to configure a new website.

Use this tool when:
- The user wants to create a new website
- You need to collect website configuration (slug, template, description)
- The user says something like "create a website", "make me a site", "deploy a new site"

The form collects:
1. **Subdomain slug** - The URL for the site (e.g., "my-bakery" → my-bakery.alive.best)
2. **Template** - Starting point (blank, gallery, event, saas, business)
3. **Description** - Optional info about what the site is for

After the user submits, their configuration is sent back as a message.
Then use the create_website tool to actually deploy the site with their choices.

Example flow:
1. User: "I want to create a website"
2. You: Call ask_website_config to show the form
3. User submits: "Domain: my-bakery.alive.best, Template: tmpl_business, Description: A local bakery..."
4. You: Call create_website({ slug: "my-bakery", templateId: "tmpl_business", siteIdeas: "A local bakery..." })`,
  askWebsiteConfigParamsSchema,
  async args => {
    return askWebsiteConfig(args)
  },
)
