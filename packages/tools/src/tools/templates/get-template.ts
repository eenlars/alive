import { readdir, readFile, realpath } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"
import { isTemplateEnabled } from "../../lib/template-frontmatter.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Zod schema for get_template parameters (raw shape, not z.object())
 */
export const getTemplateParamsSchema = {
  id: z
    .string()
    .describe(
      "Template ID (e.g., 'carousel-thumbnails', 'map-basic-markers'). " +
        "CRITICAL: Only use when user message contains EXACT phrase 'Use template: {template-id}'. " +
        "Do NOT call for natural language requests like 'build a carousel' or 'create a map'.",
    ),
}

export type GetTemplateParams = {
  id: string
}

export type GetTemplateResult = {
  content: Array<{ type: "text"; text: string }>
  isError: boolean
}

/**
 * Validates if a resolved path is within the allowed base directory
 */
function isPathWithinBase(resolvedPath: string, basePath: string): boolean {
  const normalizedPath = resolve(resolvedPath)
  const normalizedBase = resolve(basePath)
  return normalizedPath.startsWith(`${normalizedBase}/`) || normalizedPath === normalizedBase
}

/**
 * Search for a template file across all category subdirectories and read it
 * Returns both the path and content to avoid double I/O operations
 */
async function findAndReadTemplate(
  templateFile: string,
  templatesBasePath: string,
): Promise<{ path: string; content: string } | null> {
  try {
    // Get all subdirectories in templates folder
    const entries = await readdir(templatesBasePath, { withFileTypes: true })
    const categories = entries.filter(entry => entry.isDirectory())

    // Search each category directory for the template file
    for (const category of categories) {
      const candidatePath = join(templatesBasePath, category.name, templateFile)
      try {
        // Try to read the file directly - combines existence check and read
        const content = await readFile(candidatePath, "utf-8")
        return { path: candidatePath, content }
      } catch {}
    }

    return null // Template not found in any category
  } catch {
    return null // Error reading directories
  }
}

/**
 * Get a specific template by ID
 */
export async function getTemplate(params: GetTemplateParams, templatesBasePath: string): Promise<GetTemplateResult> {
  try {
    const { id } = params

    // Security: Validate input length (prevent DOS)
    if (id.length > 100) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Template ID too long. Maximum length is 100 characters.",
          },
        ],
        isError: true,
      }
    }

    // Security: Validate input is not empty or whitespace only
    if (!id || id.trim().length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Template ID cannot be empty.",
          },
        ],
        isError: true,
      }
    }

    // Security: Reject any path traversal attempts
    if (id.includes("..") || id.includes("/") || id.includes("\\")) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Invalid template ID: path traversal detected. Template IDs should only contain alphanumeric characters, hyphens, and dots.",
          },
        ],
        isError: true,
      }
    }

    // Security: Validate characters (only alphanumeric and hyphens)
    if (!/^[a-z0-9-]+$/i.test(id)) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Invalid template ID: contains invalid characters. Only alphanumeric characters and hyphens are allowed.",
          },
        ],
        isError: true,
      }
    }

    // Normalize template ID to lowercase for filesystem lookups
    // This ensures consistent behavior across case-sensitive and case-insensitive filesystems
    const templateFile = `${id.toLowerCase()}.md`

    // Search for template across all category subdirectories and read it
    const result = await findAndReadTemplate(templateFile, templatesBasePath)

    if (!result) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Template "${id}" not found.`,
          },
        ],
        isError: true,
      }
    }

    const { path: templatePath, content } = result

    // Check if template is disabled
    if (!isTemplateEnabled(content)) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Template "${id}" is disabled.`,
          },
        ],
        isError: true,
      }
    }

    // Security: Resolve real path and verify it's within templates directory
    const resolvedBase = resolve(templatesBasePath)
    const resolvedPath = resolve(templatePath)

    if (!isPathWithinBase(resolvedPath, resolvedBase)) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Security error: Template path is outside allowed directory.",
          },
        ],
        isError: true,
      }
    }

    try {
      // Content already read by findAndReadTemplate

      // Security: Check file size (prevent memory exhaustion)
      if (content.length > 500000) {
        // 500KB limit
        return {
          content: [
            {
              type: "text" as const,
              text: "Template file too large. Maximum size is 500KB.",
            },
          ],
          isError: true,
        }
      }

      // Security: Verify it's actually a symlink-free path
      try {
        const realPath = await realpath(resolvedPath)
        if (!isPathWithinBase(realPath, resolvedBase)) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Security error: Template symlink points outside allowed directory.",
              },
            ],
            isError: true,
          }
        }
      } catch (_realpathError) {
        // File doesn't exist or can't be resolved - will be caught below
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `# Template: ${id}\n\n${content}\n\n---\n\n**Ready to implement this template.**`,
          },
        ],
        isError: false,
      }
    } catch (fileError) {
      // Error reading template file (e.g., permission denied)
      return {
        content: [
          {
            type: "text" as const,
            text: `Error reading template "${id}": ${fileError instanceof Error ? fileError.message : String(fileError)}`,
          },
        ],
        isError: true,
      }
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error retrieving template: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    }
  }
}

/**
 * MCP tool: get_alive_super_template
 *
 * Retrieves a specific Alive Super Template by ID.
 * Templates contain detailed instructions for building components, features, or integrations.
 *
 * WHEN to use: ONLY when the user message contains the EXACT phrase "Use template: {template-id}"
 * (This phrase is sent automatically when user clicks a template in the UI)
 *
 * DO NOT use when:
 * - User says "build a carousel" or "create a map" (use your own implementation instead)
 * - User asks "what templates exist" (there's no discovery tool)
 * - Similar feature requests without the exact trigger phrase
 *
 * HOW to use: Extract the template ID from "Use template: {id}" and call with that exact ID
 */
export const getAliveSuperTemplateTool = tool(
  "get_alive_super_template",
  "Retrieves implementation instructions for a specific Alive Super Template. " +
    "CRITICAL TRIGGER: Only call when user message contains EXACT phrase 'Use template: carousel-thumbnails' (or similar template ID). " +
    "This phrase is sent by the UI when user clicks a template button. " +
    "DO NOT call for natural language requests like 'build a carousel', 'create a map', or 'I need file upload'. " +
    "For those, implement from scratch - do NOT try to find a matching template. " +
    "Templates include file structure, dependencies, and step-by-step implementation.",
  getTemplateParamsSchema,
  async args => {
    const packageRoot = join(__dirname, "../../..")
    const templatesBasePath = join(packageRoot, "supertemplate/templates")
    return getTemplate(args, templatesBasePath)
  },
)
