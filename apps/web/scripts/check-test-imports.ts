#!/usr/bin/env bun

/**
 * Pre-test validation: Check for bun:test imports
 *
 * This script ensures all test files use vitest imports instead of bun:test.
 * Vitest cannot bundle bun:test, so any imports will cause test failures.
 *
 * Usage:
 *   - Automatically runs via "pretest" hook before `bun run test`
 *   - Can be run manually: `bun run scripts/check-test-imports.ts`
 *
 * Exits with code 1 if any bun:test imports are found.
 */

import { execSync } from "node:child_process"

const RED = "\x1b[31m"
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const RESET = "\x1b[0m"

console.log("🔍 Checking for invalid bun:test imports...\n")

try {
  // Search for bun:test imports in all test files (excluding build directories)
  const result = execSync(
    'grep -rn "from.*bun:test" --include="*.test.ts" --include="*.test.tsx" --include="*.spec.ts" --include="*.spec.tsx" --exclude-dir=.next --exclude-dir=.next-test --exclude-dir=node_modules --exclude-dir=dist . 2>/dev/null || true',
    { encoding: "utf-8", cwd: process.cwd() },
  )

  const lines = result
    .trim()
    .split("\n")
    .filter(line => line.length > 0)

  if (lines.length > 0) {
    console.error(`${RED}❌ Found ${lines.length} file(s) with bun:test imports:${RESET}\n`)

    for (const line of lines) {
      console.error(`${YELLOW}  ${line}${RESET}`)
    }

    console.error(`\n${RED}Error: All test files must use vitest imports, not bun:test${RESET}`)
    console.error(`${YELLOW}Fix: Change imports to:${RESET}`)
    console.error(`  ${GREEN}import { describe, expect, test } from "vitest"${RESET}\n`)

    process.exit(1)
  }

  console.log(`${GREEN}✅ All test files use correct vitest imports${RESET}\n`)
  process.exit(0)
} catch (error) {
  console.error(`${RED}Error running validation:${RESET}`, error)
  process.exit(1)
}
