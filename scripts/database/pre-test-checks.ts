#!/usr/bin/env bun
/**
 * DEPRECATED: Replaced by knip
 *
 * This custom script has been replaced by knip (https://knip.dev/)
 * which provides better duplicate detection plus many other checks.
 *
 * Kept for reference only. Use `bun run knip` instead.
 *
 * ---
 *
 * Pre-test validation checks
 *
 * Catches issues that linters can't detect:
 * - Duplicate function names across files
 * - Duplicate class/component names
 * - Duplicate type/interface names
 * - Other code quality issues
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

interface DuplicateItem {
  name: string
  type: "function" | "class" | "component" | "type" | "interface"
  locations: string[]
}

const errors: string[] = []
const warnings: string[] = []
const projectRoot = process.cwd()

// Directories to check
const dirsToCheck = [
  "apps/web/app",
  "apps/web/components",
  "apps/web/features",
  "apps/web/lib",
  "packages/tools/src",
  "packages/images/src",
]

// Patterns to find exports
const patterns = {
  exportFunction: /export\s+(async\s+)?function\s+([A-Z][a-zA-Z0-9]*)/g,
  exportConst: /export\s+const\s+([A-Z][a-zA-Z0-9]*)\s*=/g,
  exportClass: /export\s+class\s+([A-Z][a-zA-Z0-9]*)/g,
  exportType: /export\s+type\s+([A-Z][a-zA-Z0-9]*)/g,
  exportInterface: /export\s+interface\s+([A-Z][a-zA-Z0-9]*)/g,
}

// Storage for found items
const items = new Map<string, Map<string, string[]>>()
items.set("function", new Map())
items.set("class", new Map())
items.set("component", new Map())
items.set("type", new Map())
items.set("interface", new Map())

/**
 * Recursively find all TypeScript files
 */
function findTsFiles(dir: string, files: string[] = []): string[] {
  const fullPath = join(projectRoot, dir)

  if (!existsSync(fullPath)) {
    return files
  }

  const entries = readdirSync(fullPath)

  for (const entry of entries) {
    const entryPath = join(fullPath, entry)
    const relativePath = relative(projectRoot, entryPath)

    // Skip node_modules, .next, dist, etc.
    if (
      entry === "node_modules" ||
      entry === ".next" ||
      entry === "dist" ||
      entry === ".turbo" ||
      entry.startsWith(".")
    ) {
      continue
    }

    const stat = statSync(entryPath)

    if (stat.isDirectory()) {
      findTsFiles(relativePath, files)
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      files.push(relativePath)
    }
  }

  return files
}

/**
 * Extract exports from a file
 */
function extractExports(filePath: string): void {
  const content = readFileSync(join(projectRoot, filePath), "utf-8")
  const relPath = filePath

  // Extract exported functions
  for (const match of content.matchAll(patterns.exportFunction)) {
    const name = match[2]
    if (!items.get("function")!.has(name)) {
      items.get("function")!.set(name, [])
    }
    items.get("function")!.get(name)!.push(relPath)
  }

  // Extract exported const (could be functions or components)
  for (const match of content.matchAll(patterns.exportConst)) {
    const name = match[1]
    // Check if it's a React component (JSX/TSX file + starts with capital letter)
    if (filePath.endsWith(".tsx") && /^[A-Z]/.test(name)) {
      if (!items.get("component")!.has(name)) {
        items.get("component")!.set(name, [])
      }
      items.get("component")!.get(name)!.push(relPath)
    } else {
      if (!items.get("function")!.has(name)) {
        items.get("function")!.set(name, [])
      }
      items.get("function")!.get(name)!.push(relPath)
    }
  }

  // Extract exported classes
  for (const match of content.matchAll(patterns.exportClass)) {
    const name = match[1]
    if (!items.get("class")!.has(name)) {
      items.get("class")!.set(name, [])
    }
    items.get("class")!.get(name)!.push(relPath)
  }

  // Extract exported types
  for (const match of content.matchAll(patterns.exportType)) {
    const name = match[1]
    if (!items.get("type")!.has(name)) {
      items.get("type")!.set(name, [])
    }
    items.get("type")!.get(name)!.push(relPath)
  }

  // Extract exported interfaces
  for (const match of content.matchAll(patterns.exportInterface)) {
    const name = match[1]
    if (!items.get("interface")!.has(name)) {
      items.get("interface")!.set(name, [])
    }
    items.get("interface")!.get(name)!.push(relPath)
  }
}

/**
 * Check if duplicate should be ignored
 */
function shouldIgnoreDuplicate(name: string, type: string, locations: string[]): boolean {
  // Ignore Next.js API route handlers (GET, POST, PUT, DELETE, PATCH, OPTIONS)
  if (
    type === "function" &&
    ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"].includes(name) &&
    locations.every(loc => loc.includes("/route.ts"))
  ) {
    return true
  }

  // Ignore auto-generated Supabase types
  if (
    (type === "type" || type === "interface") &&
    locations.every(loc => loc.includes("lib/supabase/") && loc.endsWith(".types.ts"))
  ) {
    return true
  }

  // Ignore duplicates across different workspaces (apps vs packages)
  const hasApps = locations.some(loc => loc.startsWith("apps/"))
  const hasPackages = locations.some(loc => loc.startsWith("packages/"))
  if (hasApps && hasPackages) {
    return true
  }

  return false
}

/**
 * Find duplicates
 */
function findDuplicates(): DuplicateItem[] {
  const duplicates: DuplicateItem[] = []

  for (const [type, nameMap] of items) {
    for (const [name, locations] of nameMap) {
      if (locations.length > 1) {
        // Filter out false positives: same file repeated
        const uniqueLocations = [...new Set(locations)]

        if (uniqueLocations.length > 1 && !shouldIgnoreDuplicate(name, type, uniqueLocations)) {
          duplicates.push({
            name,
            type: type as DuplicateItem["type"],
            locations: uniqueLocations,
          })
        }
      }
    }
  }

  return duplicates
}

/**
 * Main execution
 */
function main() {
  console.log("🔍 Running pre-test validation checks...")
  console.log()

  // Find all TypeScript files
  let allFiles: string[] = []
  for (const dir of dirsToCheck) {
    allFiles = allFiles.concat(findTsFiles(dir))
  }

  console.log(`📁 Scanning ${allFiles.length} TypeScript files...`)
  console.log()

  // Extract exports from all files
  for (const file of allFiles) {
    extractExports(file)
  }

  // Find duplicates
  const duplicates = findDuplicates()

  if (duplicates.length === 0) {
    console.log("✅ No duplicate exports found!")
    console.log()
    return 0
  }

  // Separate errors (functions/classes/components) from warnings (types/interfaces)
  const criticalDuplicates = duplicates.filter(d => ["function", "class", "component"].includes(d.type))
  const typeDuplicates = duplicates.filter(d => ["type", "interface"].includes(d.type))

  // Report type duplicates as warnings
  if (typeDuplicates.length > 0) {
    console.log(`⚠️  Found ${typeDuplicates.length} duplicate type/interface export(s):\n`)
    for (const dup of typeDuplicates) {
      console.log(`  ${dup.type.toUpperCase()}: ${dup.name}`)
      for (const loc of dup.locations) {
        console.log(`    - ${loc}`)
      }
      console.log()
    }
    console.log("💡 Consider consolidating these types to reduce duplication\n")
  }

  // Report critical duplicates as errors
  if (criticalDuplicates.length > 0) {
    console.log(`❌ Found ${criticalDuplicates.length} duplicate function/class/component export(s):\n`)
    for (const dup of criticalDuplicates) {
      errors.push(`Duplicate ${dup.type}: ${dup.name}`)
      console.log(`  ${dup.type.toUpperCase()}: ${dup.name}`)
      for (const loc of dup.locations) {
        console.log(`    - ${loc}`)
      }
      console.log()
    }
    console.log("💡 Rename one of the duplicates or make it non-exported if it's internal-only")
    console.log()
    return 1
  }

  // Only warnings, no errors
  return 0
}

// Run checks
const exitCode = main()
process.exit(exitCode)
