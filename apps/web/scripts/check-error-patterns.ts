#!/usr/bin/env bun
/**
 * Error Code Pattern Checker
 *
 * Pre-test script that validates all API routes use proper error handling patterns.
 * Runs automatically before tests via `pretest` npm script.
 *
 * Anti-patterns detected:
 * 1. String error codes: error: "UNAUTHORIZED" → ErrorCodes.UNAUTHORIZED
 * 2. Hardcoded messages: error: "Unauthorized" → getErrorMessage()
 * 3. Manual NextResponse.json → createErrorResponse()
 * 4. Wrong CORS helper → createCorsErrorResponse()
 * 5. Non-standard format: success → ok
 *
 * Escape hatch: Add comment to skip file-level checks:
 *   // @error-check-disable - Reason why
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

interface ErrorPattern {
  file: string
  line: number
  column: number
  stringLiteral: string
  suggestedFix: string | null
  suggestedMessage: string | null
  context: string
  severity: "error" | "warning"
}

const ERROR_CODE_MAPPING: Record<string, { code: string; message: string }> = {
  UNAUTHORIZED: {
    code: "ErrorCodes.UNAUTHORIZED",
    message: "I don't have permission to access this resource",
  },
  INTERNAL_ERROR: {
    code: "ErrorCodes.INTERNAL_ERROR",
    message: "I encountered an unexpected error",
  },
  INVALID_REQUEST: {
    code: "ErrorCodes.INVALID_REQUEST",
    message: "The request is invalid or malformed",
  },
  INVALID_JSON: {
    code: "ErrorCodes.INVALID_JSON",
    message: "I couldn't parse the request body as valid JSON",
  },
  NO_SESSION: {
    code: "ErrorCodes.NO_SESSION",
    message: "No active session found",
  },
}

function findApiRoutes(dir: string, routes: string[] = []): string[] {
  try {
    const entries = readdirSync(dir)

    for (const entry of entries) {
      const fullPath = join(dir, entry)
      const stat = statSync(fullPath)

      if (stat.isDirectory()) {
        if (!entry.startsWith("__tests__") && entry !== "node_modules") {
          findApiRoutes(fullPath, routes)
        }
      } else if (entry === "route.ts") {
        routes.push(fullPath)
      }
    }
  } catch {
    // Silently skip unreadable directories
  }

  return routes
}

function checkFileForStringErrors(filePath: string): ErrorPattern[] {
  const content = readFileSync(filePath, "utf-8")
  const lines = content.split("\n")
  const patterns: ErrorPattern[] = []

  // Skip files with explicit disable comment
  if (content.includes("@error-check-disable")) {
    return []
  }

  // Check if file is a helper definition file (exclude from some checks)
  const isHelperFile =
    content.includes("export function createErrorResponse") ||
    content.includes("export function createCorsErrorResponse") ||
    content.includes("export function createCorsResponse") ||
    content.includes("export function structuredErrorResponse") ||
    filePath.includes("responses.ts") ||
    filePath.includes("auth.ts") ||
    filePath.includes("structured-error.ts")

  // Compile regex patterns once
  const errorStringRegex = /error:\s*["']([A-Z_]+)["']/g
  const hardcodedErrorRegex = /error:\s*["']([^"']+)["']/g
  const successBoolRegex = /success:\s*(true|false)/g
  const manualErrorResponseRegex = /NextResponse\.json\s*\(\s*\{[^}]*(?:ok:\s*false|error:\s*["'ErrorCodes])/
  const wrongCorsHelperRegex = /createCorsResponse\s*\([^,]+,\s*\{[^}]*ok:\s*false/
  const customHelperRegex = /function\s+errorResponse\s*\(/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNumber = i + 1

    // ANTI-PATTERN 1: String error codes (error: "UNAUTHORIZED")
    let match: RegExpExecArray | null = null
    const errorStringMatches = line.matchAll(errorStringRegex)

    for (match of errorStringMatches) {
      const errorString = match[1]
      if (!line.includes("ErrorCodes.") && !line.includes("as const")) {
        const mapping = ERROR_CODE_MAPPING[errorString]
        patterns.push({
          file: filePath,
          line: lineNumber,
          column: match.index!,
          stringLiteral: errorString,
          suggestedFix: mapping?.code || `ErrorCodes.${errorString} (if it exists)`,
          suggestedMessage: "ANTI-PATTERN 1: String error code instead of ErrorCode constant",
          context: line.trim(),
          severity: "error",
        })
      }
    }

    // ANTI-PATTERN 2: Hardcoded error messages (error: "Unauthorized")
    const hardcodedMatches = line.matchAll(hardcodedErrorRegex)

    for (match of hardcodedMatches) {
      const errorMessage = match[1]

      // Only flag lowercase/mixed-case messages, not SCREAMING_SNAKE_CASE constants
      if (
        !line.includes("ErrorCodes.") &&
        !/^[A-Z_]+$/.test(errorMessage) &&
        !line.includes("as const") &&
        errorMessage.length > 0
      ) {
        patterns.push({
          file: filePath,
          line: lineNumber,
          column: match.index!,
          stringLiteral: `"${errorMessage}"`,
          suggestedFix: "Use ErrorCodes constant + createErrorResponse() helper",
          suggestedMessage: "ANTI-PATTERN 2: Hardcoded error message bypassing getErrorMessage()",
          context: line.trim(),
          severity: "error",
        })
      }
    }

    // ANTI-PATTERN 3: Manual NextResponse.json with error field
    if (!isHelperFile && manualErrorResponseRegex.test(line)) {
      patterns.push({
        file: filePath,
        line: lineNumber,
        column: 0,
        stringLiteral: "NextResponse.json({ ok: false ... })",
        suggestedFix: "Use createErrorResponse() or createCorsErrorResponse() helper",
        suggestedMessage: "ANTI-PATTERN 3: Manual error response construction",
        context: line.trim(),
        severity: "error",
      })
    }

    // ANTI-PATTERN 4: Using createCorsResponse for errors
    if (wrongCorsHelperRegex.test(line) && !line.includes("//") && !isHelperFile) {
      patterns.push({
        file: filePath,
        line: lineNumber,
        column: 0,
        stringLiteral: "createCorsResponse(origin, { ok: false ... })",
        suggestedFix: "Use createCorsErrorResponse(origin, ErrorCode, status, { requestId })",
        suggestedMessage: "ANTI-PATTERN 4: Using createCorsResponse instead of createCorsErrorResponse",
        context: line.trim(),
        severity: "error",
      })
    }

    // ANTI-PATTERN 5: { success: false } instead of { ok: false }
    const successMatches = line.matchAll(successBoolRegex)

    for (match of successMatches) {
      if (
        !line.includes("//") &&
        !line.includes("successResponse") &&
        !line.includes("DeployResponse") &&
        !line.includes("type ") &&
        !line.includes("interface ")
      ) {
        patterns.push({
          file: filePath,
          line: lineNumber,
          column: match.index!,
          stringLiteral: "success: boolean",
          suggestedFix: "Use { ok: boolean } for standard response format",
          suggestedMessage: "ANTI-PATTERN 5: Non-standard response format",
          context: line.trim(),
          severity: "error",
        })
      }
    }

    // WARNING: Custom error helper functions
    if (customHelperRegex.test(line) && !isHelperFile) {
      patterns.push({
        file: filePath,
        line: lineNumber,
        column: 0,
        stringLiteral: "custom errorResponse() helper",
        suggestedFix: "Use standard createErrorResponse() or createCorsErrorResponse()",
        suggestedMessage: "Custom helpers discouraged - use standard helpers",
        context: line.trim(),
        severity: "warning",
      })
    }
  }

  // FILE-LEVEL CHECKS
  // Only flag files that construct ACTUAL error responses (not just have error variables)
  const hasActualErrorResponse =
    /\{\s*ok:\s*false/.test(content) || // { ok: false }
    /\{\s*error:\s*["'`]/.test(content) || // { error: "string" }
    /\{\s*error:\s*ErrorCodes\./.test(content) // { error: ErrorCodes.X }

  if (hasActualErrorResponse && !isHelperFile) {
    const hasErrorCodesImport = content.includes('from "@/lib/error-codes"')
    const hasCreateErrorResponse =
      content.includes("createErrorResponse") ||
      content.includes("createCorsErrorResponse") ||
      content.includes("structuredErrorResponse")
    const hasNextResponseJson = /NextResponse\.json\s*\(\s*\{/.test(content)

    // Only require ErrorCodes import if file uses it
    if (!hasErrorCodesImport && /error:\s*ErrorCodes\./.test(content)) {
      patterns.push({
        file: filePath,
        line: 1,
        column: 0,
        stringLiteral: "Missing ErrorCodes import",
        suggestedFix: 'Add: import { ErrorCodes } from "@/lib/error-codes"',
        suggestedMessage: "File uses ErrorCodes but doesn't import it",
        context: "// Add at top of file",
        severity: "error",
      })
    }

    // Only warn about missing helpers if file manually constructs errors
    if (!hasCreateErrorResponse && hasNextResponseJson && /\{\s*ok:\s*false/.test(content)) {
      patterns.push({
        file: filePath,
        line: 1,
        column: 0,
        stringLiteral: "Missing error response helper import",
        suggestedFix:
          'Add: import { createErrorResponse } from "@/features/auth/lib/auth" OR import { createCorsErrorResponse } from "@/lib/api/responses"',
        suggestedMessage: "File constructs error responses manually without using helpers",
        context: "// Add at top of file",
        severity: "warning",
      })
    }
  }

  return patterns
}

function getRelativePath(absolutePath: string): string {
  const cwd = process.cwd()
  return absolutePath.replace(`${cwd}/`, "")
}

function formatErrorMessage(patterns: ErrorPattern[]): string {
  const errors = patterns.filter(p => p.severity === "error")
  const warnings = patterns.filter(p => p.severity === "warning")

  let message = "\n❌ Error Code Pattern Violations Found\n"
  message += `${"═".repeat(50)}\n\n`

  if (errors.length > 0) {
    message += `🔴 ERRORS (${errors.length} must be fixed):\n\n`
    for (const pattern of errors) {
      const relativePath = getRelativePath(pattern.file)
      message += `  ${relativePath}:${pattern.line}:${pattern.column}\n`
      if (pattern.suggestedMessage) {
        message += `  🚫 ${pattern.suggestedMessage}\n`
      }
      message += `  ❌ Found: ${pattern.stringLiteral}\n`
      if (pattern.suggestedFix) {
        message += `  ✅ Fix:   ${pattern.suggestedFix}\n`
      }
      message += `  📝 Context: ${pattern.context}\n\n`
    }
  }

  if (warnings.length > 0) {
    message += `⚠️  WARNINGS (${warnings.length} should be fixed):\n\n`
    for (const pattern of warnings) {
      const relativePath = getRelativePath(pattern.file)
      message += `  ${relativePath}:${pattern.line}\n`
      message += `  ⚠️  Issue: ${pattern.stringLiteral}\n`
      message += `  ✅ Fix:   ${pattern.suggestedFix}\n`
      message += `  📝 Context: ${pattern.context}\n\n`
    }
  }

  message += `${"═".repeat(50)}\n`
  message += "📚 Error Handling Anti-Patterns (DO NOT USE):\n\n"
  message += '  ❌ ANTI-PATTERN 1: error: "UNAUTHORIZED" (string)\n'
  message += "     ✅ USE: error: ErrorCodes.UNAUTHORIZED (constant)\n\n"
  message += '  ❌ ANTI-PATTERN 2: error: "Unauthorized" (hardcoded message)\n'
  message += "     ✅ USE: ErrorCodes + getErrorMessage() via helpers\n\n"
  message += "  ❌ ANTI-PATTERN 3: NextResponse.json({ ok: false, ... })\n"
  message += "     ✅ USE: createErrorResponse() or createCorsErrorResponse()\n\n"
  message += "  ❌ ANTI-PATTERN 4: createCorsResponse(origin, { ok: false, ... })\n"
  message += "     ✅ USE: createCorsErrorResponse(origin, ErrorCode, status, { requestId })\n\n"
  message += "  ❌ ANTI-PATTERN 5: { success: false }\n"
  message += "     ✅ USE: { ok: false } (standard format)\n\n"
  message += `${"═".repeat(50)}\n`
  message += "📖 Documentation:\n"
  message += "  • ErrorCodes: apps/web/lib/error-codes.ts\n"
  message += "  • getErrorMessage(): apps/web/lib/error-codes.ts\n"
  message += "  • createErrorResponse(): apps/web/features/auth/lib/auth.ts\n"
  message += "  • createCorsErrorResponse(): apps/web/lib/api/responses.ts\n"
  message += `${"═".repeat(50)}\n`

  return message
}

// Main execution
const apiDir = join(process.cwd(), "app", "api")
const routes = findApiRoutes(apiDir)

if (routes.length === 0) {
  console.log("⚠️  No API routes found to check")
  process.exit(0)
}

const allPatterns: ErrorPattern[] = []

for (const route of routes) {
  const patterns = checkFileForStringErrors(route)
  allPatterns.push(...patterns)
}

const errors = allPatterns.filter(p => p.severity === "error")
const warnings = allPatterns.filter(p => p.severity === "warning")

if (allPatterns.length > 0) {
  console.log(formatErrorMessage(allPatterns))
  console.log(`\n${errors.length > 0 ? "❌" : "✅"} Found ${errors.length} errors and ${warnings.length} warnings`)

  if (errors.length > 0) {
    console.error("Fix these errors before running tests.\n")
    process.exit(1)
  }

  if (warnings.length > 0) {
    console.log("Warnings are acceptable but should be addressed when possible.\n")
  }
}

if (errors.length === 0) {
  console.log("✅ All API routes use proper error code patterns")
}

process.exit(0)
