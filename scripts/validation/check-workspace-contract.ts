#!/usr/bin/env bun

import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

type PackageJson = {
  name?: string
  private?: boolean
  scripts?: Record<string, string>
  workspaces?: string[] | { packages?: string[] }
}

const REQUIRED_SCRIPTS = ["type-check", "lint", "format", "ci"] as const

const CI_DISALLOWED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b--write\b/, reason: "must be check-only (no --write)" },
  { pattern: /\b--fix\b/, reason: "must be check-only (no --fix)" },
  { pattern: /\bgofmt\s+-w\b/, reason: "must be check-only (no gofmt -w)" },
]

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "../..")

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf-8")) as T
}

function getWorkspacePatterns(): string[] {
  const rootPackageJson = readJson<PackageJson>(path.join(ROOT, "package.json"))
  const { workspaces } = rootPackageJson

  if (!workspaces) {
    throw new Error("Root package.json is missing workspaces configuration")
  }

  if (Array.isArray(workspaces)) {
    return workspaces
  }

  if (Array.isArray(workspaces.packages)) {
    return workspaces.packages
  }

  throw new Error("Unsupported workspaces format in root package.json")
}

function expandWorkspacePattern(pattern: string): string[] {
  const normalized = pattern.replace(/\\/g, "/")
  if (!normalized.includes("*")) {
    return [path.resolve(ROOT, normalized)]
  }

  const starIndex = normalized.indexOf("*")
  const prefix = normalized.slice(0, starIndex)
  const suffix = normalized.slice(starIndex + 1)
  const baseRelative = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix
  const baseAbsolute = path.resolve(ROOT, baseRelative)

  if (!existsSync(baseAbsolute)) {
    return []
  }

  const directories = readdirSync(baseAbsolute, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(baseAbsolute, entry.name))

  if (suffix.length === 0) {
    return directories
  }

  return directories
    .map(directory => path.join(directory, suffix))
    .filter(candidate => existsSync(candidate))
}

function getWorkspacePackageJsonPaths(): string[] {
  const patterns = getWorkspacePatterns()
  const packageJsonPaths = new Set<string>()

  for (const pattern of patterns) {
    const directories = expandWorkspacePattern(pattern)
    for (const directory of directories) {
      const packageJsonPath = path.join(directory, "package.json")
      if (existsSync(packageJsonPath)) {
        packageJsonPaths.add(path.relative(ROOT, packageJsonPath))
      }
    }
  }

  return [...packageJsonPaths].sort()
}

function findProblems(packageJsonPath: string): string[] {
  const fullPath = path.join(ROOT, packageJsonPath)
  const packageJson = readJson<PackageJson>(fullPath)
  const scripts = packageJson.scripts ?? {}
  const problems: string[] = []

  for (const requiredScript of REQUIRED_SCRIPTS) {
    const scriptValue = scripts[requiredScript]
    if (!scriptValue || !scriptValue.trim()) {
      problems.push(`missing required script "${requiredScript}"`)
    }
  }

  const ciScript = scripts.ci
  if (ciScript) {
    for (const { pattern, reason } of CI_DISALLOWED_PATTERNS) {
      if (pattern.test(ciScript)) {
        problems.push(`scripts.ci ${reason}`)
      }
    }
  }

  return problems
}

function main() {
  const packageJsonPaths = getWorkspacePackageJsonPaths()
  if (packageJsonPaths.length === 0) {
    console.error("No workspace package.json files found from root workspaces configuration")
    process.exit(1)
  }

  const failures: Array<{ path: string; problems: string[] }> = []

  for (const packageJsonPath of packageJsonPaths) {
    const problems = findProblems(packageJsonPath)
    if (problems.length > 0) {
      failures.push({ path: packageJsonPath, problems })
    }
  }

  if (failures.length > 0) {
    console.error("❌ Workspace script contract violations:")
    for (const failure of failures) {
      console.error(`\n- ${failure.path}`)
      for (const problem of failure.problems) {
        console.error(`  - ${problem}`)
      }
    }
    console.error(
      "\nFix these to keep conventions enforced by tooling (fewer review-time decisions, faster merges).",
    )
    process.exit(1)
  }

  console.log(`✓ Workspace script contract validated across ${packageJsonPaths.length} workspaces`)
}

main()
