/**
 * Shared frontmatter parser for template files.
 * Single source of truth for parsing YAML frontmatter from .md template files.
 */

/**
 * Template frontmatter structure parsed from YAML header
 */
/**
 * Standard template categories
 */
export const TEMPLATE_CATEGORIES = [
  "ui-components",
  "forms",
  "data-display",
  "navigation",
  "media",
  "layout",
  "integrations",
  "animations",
  "landing",
  "maps",
  "backend",
  "setup",
  "frontend",
  "content-management",
  "photo-sliders",
  "components", // legacy alias for ui-components
  "forms-and-inputs", // legacy alias for forms
  "other",
] as const

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

export interface TemplateFrontmatter {
  name: string
  description: string
  category: TemplateCategory
  complexity: 1 | 2 | 3 | 4 | 5
  files: number
  dependencies: string[] // With versions: "swiper@^11.0.0"
  estimatedTime: string
  estimatedTokens: number
  tags: string[]
  requires: string[]
  previewImage: string
  enabled: boolean
}

/**
 * Partial frontmatter for parsing (all fields optional during parse)
 */
export interface PartialTemplateFrontmatter {
  name?: string
  description?: string
  category?: string
  complexity?: number
  files?: number
  dependencies?: string[]
  estimatedTime?: string
  estimatedTokens?: number
  tags?: string[]
  requires?: string[]
  previewImage?: string
  enabled?: boolean
}

/**
 * Parse YAML frontmatter from a template file.
 * Returns null if no valid frontmatter found.
 *
 * @param content - Raw markdown content with YAML frontmatter
 * @returns Parsed frontmatter object or null if invalid/missing
 */
export function parseFrontmatter(content: string): PartialTemplateFrontmatter | null {
  if (!content.startsWith("---")) {
    return null
  }

  const endIndex = content.indexOf("---", 3)
  if (endIndex === -1) {
    return null
  }

  const frontmatter = content.slice(3, endIndex).trim()
  const result: PartialTemplateFrontmatter = {}

  // Simple YAML parsing for our known fields
  for (const line of frontmatter.split("\n")) {
    const colonIndex = line.indexOf(":")
    if (colonIndex === -1) continue

    const key = line.slice(0, colonIndex).trim()
    const value = line.slice(colonIndex + 1).trim()

    // Skip array items (lines starting with -)
    if (key.startsWith("-")) continue

    switch (key) {
      case "name":
      case "description":
      case "category":
      case "estimatedTime":
      case "previewImage":
        result[key] = value
        break
      case "complexity":
      case "files":
      case "estimatedTokens":
        result[key] = Number.parseInt(value, 10)
        break
      case "enabled":
        result.enabled = value.toLowerCase() === "true"
        break
      case "tags":
        // Parse inline array [a, b, c]
        if (value.startsWith("[")) {
          result.tags = value
            .slice(1, -1)
            .split(",")
            .map(s => s.trim())
        }
        break
      case "dependencies":
        // If inline array
        if (value.startsWith("[")) {
          result.dependencies = value
            .slice(1, -1)
            .split(",")
            .map(s => s.trim())
            .filter(Boolean)
        } else if (!value) {
          // Multi-line array follows, parse next lines
          result.dependencies = []
        }
        break
      case "requires":
        if (!value) {
          result.requires = []
        }
        break
    }
  }

  // Parse multi-line arrays (dependencies, requires)
  const lines = frontmatter.split("\n")
  let currentArray: "dependencies" | "requires" | null = null

  for (const line of lines) {
    if (line.match(/^dependencies:\s*$/)) {
      currentArray = "dependencies"
      result.dependencies = []
    } else if (line.match(/^requires:\s*$/)) {
      currentArray = "requires"
      result.requires = []
    } else if (line.match(/^\s+-\s+/)) {
      if (currentArray && result[currentArray]) {
        const value = line
          .replace(/^\s+-\s+/, "")
          .trim()
          .replace(/^["']|["']$/g, "")
        ;(result[currentArray] as string[]).push(value)
      }
    } else if (!line.startsWith(" ") && !line.startsWith("\t") && line.includes(":")) {
      currentArray = null
    }
  }

  return result
}

/**
 * Check if a template is enabled via YAML frontmatter.
 * Templates with `enabled: false` in frontmatter are disabled.
 * Returns true if no frontmatter or `enabled` field not specified.
 *
 * @param content - Raw markdown content with YAML frontmatter
 * @returns true if template is enabled, false otherwise
 */
export function isTemplateEnabled(content: string): boolean {
  const frontmatter = parseFrontmatter(content)
  return frontmatter?.enabled !== false
}

/**
 * Required fields for a valid template frontmatter
 */
export const REQUIRED_FRONTMATTER_FIELDS = ["name", "description", "category", "complexity", "enabled"] as const

/**
 * Validate that frontmatter has all required fields
 *
 * @param frontmatter - Parsed frontmatter to validate
 * @returns Array of missing field names, empty if valid
 */
export function validateFrontmatter(frontmatter: PartialTemplateFrontmatter | null): string[] {
  if (!frontmatter) return ["frontmatter"]

  const missing: string[] = []
  for (const field of REQUIRED_FRONTMATTER_FIELDS) {
    if (frontmatter[field] === undefined) {
      missing.push(field)
    }
  }
  return missing
}
