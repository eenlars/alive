#!/usr/bin/env bun

import { spawnSync } from "node:child_process"
import { constants } from "node:fs"
import { access, cp, mkdir, readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"

function getRepoRoot(): string {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  })

  if (result.status !== 0) {
    const details = (result.stderr || result.stdout || "unknown git error").trim()
    throw new Error(`Unable to resolve git repository root: ${details}`)
  }

  return result.stdout.trim()
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function validateSkillFrontmatter(content: string, skillName: string): string | null {
  if (!content.startsWith("---")) {
    return `missing YAML frontmatter (must start with ---)`
  }

  const endIndex = content.indexOf("---", 3)
  if (endIndex === -1) {
    return `missing closing --- for YAML frontmatter`
  }

  const yaml = content.slice(3, endIndex).trim()

  // Parse name and description using first-colon split (same logic as skill-frontmatter.ts)
  const fields: Record<string, string> = {}
  for (const line of yaml.split("\n")) {
    const colonIndex = line.indexOf(":")
    if (colonIndex === -1) continue
    const key = line.slice(0, colonIndex).trim()
    const value = line.slice(colonIndex + 1).trim()
    // Strip surrounding quotes if present
    fields[key] = value.replace(/^["']|["']$/g, "")
  }

  if (!fields.name) {
    return `missing required field "name" in frontmatter`
  }

  // Name must be lowercase a-z/0-9 with optional hyphens between, no spaces or uppercase
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fields.name)) {
    return `invalid name "${fields.name}" — must be lowercase, no spaces, only a-z, 0-9, and hyphens (e.g. "my-skill")`
  }

  if (!fields.description) {
    return `missing required field "description" in frontmatter`
  }

  return null
}

async function syncSkills(repoRoot: string): Promise<number> {
  const sourceDir = path.join(repoRoot, ".claude", "skills")
  const targetDir = path.join(repoRoot, ".agents", "skills")

  if (!(await pathExists(sourceDir))) {
    console.warn(`[sync:skills] Source directory not found: ${path.relative(repoRoot, sourceDir)}`)
    return 0
  }

  await mkdir(targetDir, { recursive: true })
  const entries = await readdir(sourceDir)

  const errors: string[] = []

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry)
    const targetPath = path.join(targetDir, entry)

    // Validate SKILL.md frontmatter for directories
    const entryStat = await stat(sourcePath)
    if (entryStat.isDirectory()) {
      const skillMdPath = path.join(sourcePath, "SKILL.md")
      if (await pathExists(skillMdPath)) {
        const content = await readFile(skillMdPath, "utf8")
        const error = validateSkillFrontmatter(content, entry)
        if (error) {
          errors.push(`  ${entry}/SKILL.md: ${error}`)
          continue
        }
      }
    }

    await cp(sourcePath, targetPath, {
      force: true,
      recursive: true,
    })
  }

  if (errors.length > 0) {
    const msg = `[sync:skills] ${errors.length} skill(s) have invalid SKILL.md files:\n${errors.join("\n")}`
    throw new Error(msg)
  }

  return entries.length
}

async function main(): Promise<void> {
  const repoRoot = getRepoRoot()
  const syncedEntries = await syncSkills(repoRoot)
  console.log(`[sync:skills] Synced ${syncedEntries} entries into .agents/skills`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[sync:skills] Failed: ${message}`)
  process.exit(1)
})
