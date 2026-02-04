#!/usr/bin/env node
/**
 * Static Analysis: Check Import Order in Worker Entry
 *
 * CRITICAL SAFETY CHECK: This script ensures all imports in worker-entry.mjs
 * happen at the top level (module scope), not inside functions.
 *
 * Why this matters:
 * - Worker drops privileges after starting (setuid/setgid to workspace user)
 * - After privilege drop, worker can't read /root/alive/node_modules/
 * - Any import() or require() inside a function would fail with EACCES
 * - This caused production bug: "Worker disconnected unexpectedly"
 *
 * This check runs in CI to prevent the bug from recurring.
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const WORKER_ENTRY_PATH = join(__dirname, "../src/worker-entry.mjs")

// Patterns that indicate dynamic imports inside functions
const _DANGEROUS_PATTERNS = [
  // Dynamic import()
  {
    pattern: /^\s*(const|let|var)\s+\{[^}]+\}\s*=\s*await\s+import\s*\(/gm,
    message: "Dynamic import() inside function - must be at top level",
  },
  // require() calls (shouldn't exist in ESM, but check anyway)
  {
    pattern: /^\s*(const|let|var)\s+\{[^}]+\}\s*=\s*require\s*\(/gm,
    message: "require() call detected - must use top-level import",
  },
]

// Functions where imports are forbidden (after privilege drop)
const FORBIDDEN_CONTEXTS = [
  "handleQuery",
  "handleCancel",
  "handleShutdown",
  "handleHealthCheck",
  "dropPrivileges",
]

function extractFunctionBodies(code) {
  const functions = []

  for (const funcName of FORBIDDEN_CONTEXTS) {
    // Match async function declarations and function expressions
    const patterns = [
      new RegExp(`async\\s+function\\s+${funcName}\\s*\\([^)]*\\)\\s*\\{`, "g"),
      new RegExp(`function\\s+${funcName}\\s*\\([^)]*\\)\\s*\\{`, "g"),
    ]

    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(code)) !== null) {
        const startIndex = match.index + match[0].length
        let braceCount = 1
        let endIndex = startIndex

        // Find matching closing brace
        for (let i = startIndex; i < code.length && braceCount > 0; i++) {
          if (code[i] === "{") braceCount++
          if (code[i] === "}") braceCount--
          endIndex = i
        }

        functions.push({
          name: funcName,
          body: code.slice(startIndex, endIndex),
          startLine: code.slice(0, match.index).split("\n").length,
        })
      }
    }
  }

  return functions
}

function checkForDynamicImports(functionInfo) {
  const errors = []

  // Check for import() or require() patterns in function body
  const importPatterns = [
    /\bimport\s*\(/g,
    /\brequire\s*\(/g,
    /from\s+["'][^"']+["']/g, // Static import syntax inside function (shouldn't happen)
  ]

  for (const pattern of importPatterns) {
    let match
    while ((match = pattern.exec(functionInfo.body)) !== null) {
      // Get line number within function
      const lineOffset = functionInfo.body.slice(0, match.index).split("\n").length
      const absoluteLine = functionInfo.startLine + lineOffset

      errors.push({
        function: functionInfo.name,
        line: absoluteLine,
        match: match[0],
        message: `Dynamic import/require in ${functionInfo.name}() - FORBIDDEN after privilege drop!`,
      })
    }
  }

  return errors
}

function checkImportsMustBeTopLevel(code) {
  const errors = []

  // Find all import statements and verify they're at module level
  const lines = code.split("\n")
  let insideFunction = false
  let braceDepth = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Track brace depth to detect if we're inside a function
    for (const char of line) {
      if (char === "{") braceDepth++
      if (char === "}") braceDepth--
    }

    // Check for function declarations that start a new scope
    if (/^(async\s+)?function\s+\w+/.test(line.trim())) {
      insideFunction = true
    }

    // If we're at brace depth 0 and see a function end, we're back at module level
    if (braceDepth === 0) {
      insideFunction = false
    }

    // Look for import patterns
    if (insideFunction && braceDepth > 0) {
      if (/\bimport\s*\(/.test(line) || /\brequire\s*\(/.test(line)) {
        errors.push({
          line: i + 1,
          content: line.trim(),
          message: "Import/require inside function body - must be at top level!",
        })
      }
    }
  }

  return errors
}

function main() {
  console.log("🔍 Checking worker-entry.mjs for import order violations...\n")

  let code
  try {
    code = readFileSync(WORKER_ENTRY_PATH, "utf8")
  } catch (err) {
    console.error(`❌ Failed to read ${WORKER_ENTRY_PATH}: ${err.message}`)
    process.exit(1)
  }

  const allErrors = []

  // Method 1: Extract function bodies and check for dynamic imports
  const functions = extractFunctionBodies(code)
  for (const func of functions) {
    const errors = checkForDynamicImports(func)
    allErrors.push(...errors)
  }

  // Method 2: Line-by-line analysis
  const lineErrors = checkImportsMustBeTopLevel(code)
  allErrors.push(...lineErrors)

  if (allErrors.length > 0) {
    console.error("❌ CRITICAL: Found import order violations!\n")
    console.error("These imports happen AFTER privilege drop and will cause EACCES errors:\n")

    for (const error of allErrors) {
      console.error(`  Line ${error.line}: ${error.message}`)
      if (error.content) {
        console.error(`    > ${error.content}`)
      }
      if (error.match) {
        console.error(`    Found: ${error.match}`)
      }
      console.error("")
    }

    console.error("FIX: Move all imports to the TOP of the file, BEFORE any function definitions.")
    console.error("     See comment block at top of worker-entry.mjs for explanation.\n")

    process.exit(1)
  }

  // Verify critical imports are at top level (not commented out)
  const requiredTopLevelImports = [
    "@anthropic-ai/claude-agent-sdk",
    "@webalive/shared",
    "@webalive/tools",
  ]

  const topLevelImportSection = code.split(/^(async\s+)?function\s+/m)[0]
  const missingImports = []

  for (const pkg of requiredTopLevelImports) {
    // Check for uncommented import statement
    // Must match: import ... from "package" (not commented with // or /* */)
    const importPattern = new RegExp(`^\\s*import\\s+.*from\\s+["']${pkg.replace(/[/\\]/g, "\\$&")}["']`, "m")
    if (!importPattern.test(topLevelImportSection)) {
      missingImports.push(pkg)
    }
  }

  if (missingImports.length > 0) {
    console.error("❌ CRITICAL: Required packages not imported at top level!\n")
    console.error("Missing top-level imports for:")
    for (const pkg of missingImports) {
      console.error(`  - ${pkg}`)
    }
    console.error("\nThese MUST be imported before any function definitions.")
    process.exit(1)
  }

  console.log("✅ All imports are at top level (before privilege drop)")
  console.log("✅ All required packages are imported correctly\n")

  console.log("Verified top-level imports:")
  for (const pkg of requiredTopLevelImports) {
    console.log(`  ✓ ${pkg}`)
  }

  console.log("\n🎉 Import order check passed!")
}

main()
