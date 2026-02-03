/**
 * List all available skills by reading from filesystem.
 * Single source of truth: YAML frontmatter in SKILL.md files.
 *
 * Skills are loaded from:
 * - /etc/claude-code/skills/ (global, system-provided)
 * - {workspace}/.claude/skills/ (project-specific)
 */
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { parseSkillContent, skillIdToDisplayName } from "../../lib/skill-frontmatter.js"

/**
 * Skill source types
 */
export type SkillSource = "global" | "user" | "project"

/**
 * Skill list item structure for UI consumption.
 */
export interface SkillListItem {
  /** Skill ID from directory name: "revise-code" */
  id: string
  /** Human-readable display name: "Revise Code" */
  displayName: string
  /** Short description for UI (from frontmatter) */
  description: string
  /** Full prompt text (markdown body) */
  prompt: string
  /** Source: global (system), user (localStorage), or project (workspace) */
  source: SkillSource
  /** File path (only for filesystem skills) */
  filePath?: string
}

/**
 * List all skills from a directory.
 * Each skill is a subdirectory containing a SKILL.md file.
 *
 * @param skillsPath - Path to skills directory
 * @param source - Source type for these skills
 * @returns Array of available skills with metadata
 */
export async function listSkillsFromDir(skillsPath: string, source: SkillSource = "global"): Promise<SkillListItem[]> {
  const results: SkillListItem[] = []

  try {
    const entries = await readdir(skillsPath, { withFileTypes: true })
    const skillDirs = entries.filter(entry => entry.isDirectory())

    for (const dir of skillDirs) {
      const skillMdPath = join(skillsPath, dir.name, "SKILL.md")

      try {
        const content = await readFile(skillMdPath, "utf-8")
        const parsed = parseSkillContent(content)

        if (!parsed) continue

        results.push({
          id: dir.name,
          displayName: skillIdToDisplayName(dir.name),
          description: parsed.frontmatter.description,
          prompt: parsed.body,
          source,
          filePath: skillMdPath,
        })
      } catch {
        // Skip directories without valid SKILL.md
      }
    }
  } catch {
    // Return empty array if directory doesn't exist
    return []
  }

  // Sort alphabetically by display name
  return results.sort((a, b) => a.displayName.localeCompare(b.displayName))
}

/**
 * Default global skills path
 */
export const GLOBAL_SKILLS_PATH = "/etc/claude-code/skills"

/**
 * List all global skills (system-provided).
 * Reads from /etc/claude-code/skills/ which is synced during deployment.
 *
 * @param skillsPath - Optional custom path (for testing)
 * @returns Array of global skills
 */
export async function listGlobalSkills(skillsPath?: string): Promise<SkillListItem[]> {
  return listSkillsFromDir(skillsPath ?? GLOBAL_SKILLS_PATH, "global")
}

/**
 * List project-specific skills from workspace.
 *
 * @param workspacePath - Path to workspace root
 * @returns Array of project skills
 */
export async function listProjectSkills(workspacePath: string): Promise<SkillListItem[]> {
  const projectSkillsPath = join(workspacePath, ".claude", "skills")
  return listSkillsFromDir(projectSkillsPath, "project")
}

/**
 * Merge skills from multiple sources.
 * Later sources override earlier ones with the same ID.
 *
 * @param skillArrays - Arrays of skills in priority order (lowest to highest)
 * @returns Merged array with duplicates resolved
 */
export function mergeSkills(...skillArrays: SkillListItem[][]): SkillListItem[] {
  const skillMap = new Map<string, SkillListItem>()

  for (const skills of skillArrays) {
    for (const skill of skills) {
      skillMap.set(skill.id, skill)
    }
  }

  return Array.from(skillMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName))
}

/**
 * Get a specific skill by ID from an array.
 */
export function getSkillById(skills: SkillListItem[], id: string): SkillListItem | undefined {
  return skills.find(s => s.id === id)
}
