/**
 * Skill frontmatter parser for SKILL.md files.
 *
 * SKILL.md format (Claude Code standard):
 * ```
 * ---
 * name: skill-name
 * description: Short description for UI
 * ---
 *
 * # Skill Title
 *
 * Full prompt content...
 * ```
 */

/**
 * Skill frontmatter structure parsed from YAML header
 */
export interface SkillFrontmatter {
  name: string
  description: string
}

/**
 * Partial frontmatter for parsing (fields optional during parse)
 */
export interface PartialSkillFrontmatter {
  name?: string
  description?: string
}

/**
 * Complete parsed skill with frontmatter and body content
 */
export interface ParsedSkill {
  frontmatter: SkillFrontmatter
  /** Full markdown body (everything after frontmatter) - the actual prompt */
  body: string
}

/**
 * Parse YAML frontmatter and body from a SKILL.md file.
 * Returns null if no valid frontmatter found or required fields missing.
 *
 * @param content - Raw markdown content with YAML frontmatter
 * @returns Parsed skill with frontmatter and body, or null if invalid
 */
export function parseSkillContent(content: string): ParsedSkill | null {
  if (!content.startsWith("---")) {
    return null
  }

  const endIndex = content.indexOf("---", 3)
  if (endIndex === -1) {
    return null
  }

  const frontmatterRaw = content.slice(3, endIndex).trim()
  const body = content.slice(endIndex + 3).trim()

  const frontmatter = parseFrontmatter(frontmatterRaw)

  // Validate required fields
  if (!frontmatter.name || !frontmatter.description) {
    return null
  }

  return {
    frontmatter: {
      name: frontmatter.name,
      description: frontmatter.description,
    },
    body,
  }
}

/**
 * Parse YAML frontmatter string into key-value pairs.
 * Simple parser for our known fields (name, description).
 *
 * @param frontmatterRaw - Raw YAML string (without --- delimiters)
 * @returns Partial frontmatter object
 */
function parseFrontmatter(frontmatterRaw: string): PartialSkillFrontmatter {
  const result: PartialSkillFrontmatter = {}

  for (const line of frontmatterRaw.split("\n")) {
    const colonIndex = line.indexOf(":")
    if (colonIndex === -1) continue

    const key = line.slice(0, colonIndex).trim()
    const value = line.slice(colonIndex + 1).trim()

    switch (key) {
      case "name":
      case "description":
        result[key] = value
        break
    }
  }

  return result
}

/**
 * Convert skill ID (directory name) to display name.
 * Example: "revise-code" -> "Revise Code"
 *
 * @param id - Skill ID (kebab-case directory name)
 * @returns Human-readable display name
 */
export function skillIdToDisplayName(id: string): string {
  return id
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}
