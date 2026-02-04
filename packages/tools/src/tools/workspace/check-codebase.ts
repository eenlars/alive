import { existsSync } from "node:fs"
import { join } from "node:path"
import { tool } from "@anthropic-ai/claude-agent-sdk"
import { truncateOutput } from "@webalive/shared"
import { errorResult, successResult, type ToolResult } from "../../lib/api-client.js"
import { safeSpawnSync } from "../../lib/safe-spawn.js"
import { hasPackageJson, validateWorkspacePath } from "../../lib/workspace-validator.js"

/** Column threshold for detecting minified code (normal code rarely exceeds 200) */
const MINIFIED_CODE_COLUMN_THRESHOLD = 500

/** Max chars to log for debugging (prevent log spam) */
const LOG_TRUNCATE_LENGTH = 500

/**
 * Detect if a lint error line is from minified/bundled code.
 * Signs: very high column numbers, single-char variable names in hooks errors
 */
function isMinifiedCodeError(line: string): boolean {
  // Extract column number - patterns like ":495" or "col 495" or "(495)"
  const colMatch = line.match(/:(\d+)[\s:]|col\s+(\d+)|\((\d+)\)/)
  if (colMatch) {
    const col = Number.parseInt(colMatch[1] || colMatch[2] || colMatch[3], 10)
    if (col > MINIFIED_CODE_COLUMN_THRESHOLD) return true
  }

  // Detect mangled variable names in React hooks errors (1-2 char names)
  // e.g., 'React Hook "Z.useState" is called in function "tt"'
  if (line.includes("React Hook") && /function\s+"[a-zA-Z]{1,2}"/.test(line)) {
    return true
  }

  return false
}

/**
 * Analyze lint output and separate real errors from minified code noise.
 */
function analyzeLintOutput(output: string): {
  realErrors: string[]
  minifiedCount: number
  hasMinifiedWarning: boolean
} {
  const lines = output.split("\n").filter(line => line.includes("error") && !line.includes("errors found"))
  const realErrors: string[] = []
  let minifiedCount = 0

  for (const line of lines) {
    if (isMinifiedCodeError(line)) {
      minifiedCount++
    } else {
      realErrors.push(line)
    }
  }

  return {
    realErrors,
    minifiedCount,
    hasMinifiedWarning: minifiedCount > 0,
  }
}

export const checkCodebaseParamsSchema = {}

export type CheckCodebaseParams = Record<string, never>

/**
 * Run TypeScript type checking and linting on the workspace.
 *
 * SECURITY MODEL (Direct Execution Pattern):
 * - This tool runs AFTER privilege drop (setuid/setgid to workspace user)
 * - Process already runs as workspace user, NOT root
 * - No HTTP roundtrip needed - direct execution for read-only operations
 * - Uses sanitized environment to prevent cache access issues
 *
 * EXECUTION:
 * - Runs `bun run tsc --noEmit` for TypeScript type checking
 * - Runs `bun run lint` for ESLint/Biome linting
 * - Both commands executed with isolated, sanitized environment
 */
export async function checkCodebase(_params: CheckCodebaseParams): Promise<ToolResult> {
  // Security: Use process.cwd() set by Bridge - never accept workspace from user
  const workspaceRoot = process.cwd()

  try {
    // Security: Validate workspace path
    validateWorkspacePath(workspaceRoot)

    // Verify this is a Node.js project
    if (!hasPackageJson(workspaceRoot)) {
      return errorResult("No package.json found in workspace", "This doesn't appear to be a Node.js project.")
    }

    // TODO: SECURITY - User can potentially override these commands via package.json scripts
    // or malicious node_modules. Since this runs as workspace user in their own workspace,
    // impact is limited to self-attack, but consider:
    // - Running from trusted tsc/eslint outside workspace
    // - Validating package.json scripts before execution
    // - Using containerized checker

    // Detect tsconfig: Vite uses tsconfig.app.json, others use tsconfig.json
    const tsconfigApp = join(workspaceRoot, "tsconfig.app.json")
    const tsconfigDefault = join(workspaceRoot, "tsconfig.json")
    const tsconfig = existsSync(tsconfigApp)
      ? "tsconfig.app.json"
      : existsSync(tsconfigDefault)
        ? "tsconfig.json"
        : null

    // Run TypeScript check - use "bun x" to run tsc from node_modules
    // (bunx is only in /root/.bun/bin, but "bun x" works from /usr/local/bin/bun)
    const tscArgs = tsconfig ? ["x", "tsc", "--project", tsconfig, "--noEmit"] : ["x", "tsc", "--noEmit"]
    const tscResult = safeSpawnSync("bun", tscArgs, {
      cwd: workspaceRoot,
    })

    console.error(
      "[check_codebase] TSC Result:",
      JSON.stringify({
        status: tscResult.status,
        stdout: tscResult.stdout?.substring(0, LOG_TRUNCATE_LENGTH),
        stderr: tscResult.stderr?.substring(0, LOG_TRUNCATE_LENGTH),
        error: tscResult.error,
      }),
    )

    // Handle case where tsc command itself failed to run (e.g., bun not in PATH)
    if (tscResult.error) {
      return errorResult(
        "Failed to run TypeScript check",
        `Command failed: ${tscResult.error.message}\n\nThis usually means 'bun' or 'tsc' is not available. Try running 'bun install' first.`,
      )
    }

    // Run ESLint check
    const lintResult = safeSpawnSync("bun", ["run", "lint"], {
      cwd: workspaceRoot,
    })

    console.error(
      "[check_codebase] Lint Result:",
      JSON.stringify({
        status: lintResult.status,
        stdout: lintResult.stdout?.substring(0, LOG_TRUNCATE_LENGTH),
        stderr: lintResult.stderr?.substring(0, LOG_TRUNCATE_LENGTH),
        error: lintResult.error,
      }),
    )

    // Handle case where lint command itself failed to run
    if (lintResult.error) {
      return errorResult(
        "Failed to run lint check",
        `Command failed: ${lintResult.error.message}\n\nMake sure 'bun run lint' works in this workspace.`,
      )
    }

    const tscPassed = tscResult.status === 0
    const lintPassed = lintResult.status === 0

    // All checks passed
    if (tscPassed && lintPassed) {
      return successResult(
        "All checks passed! Codebase is healthy. ✅\n\nIf this is your last check, revise and see if you've done everything the user asked according to their needs. If not, continue.",
      )
    }

    // Build detailed error report
    const errors: string[] = []

    if (!tscPassed) {
      errors.push("❌ TypeScript Type Errors (you should fix these before proceeding):\n")

      // Combine stdout and stderr for complete error output
      const tscOutput = [tscResult.stdout, tscResult.stderr].filter(Boolean).join("\n")

      // Extract TypeScript error lines (format: file.ts(line,col): error TS1234: message)
      const tsErrors = tscOutput.match(/^.+\(\d+,\d+\): error TS\d+:.+$/gm)

      if (tsErrors && tsErrors.length > 0) {
        // Show first 10 errors with clear formatting
        const displayErrors = tsErrors.slice(0, 10)
        errors.push(...displayErrors.map(e => `  ${e}`))

        if (tsErrors.length > 10) {
          errors.push(`\n  ... and ${tsErrors.length - 10} more TypeScript errors`)
        }

        // Add summary line
        const errorCount = tscOutput.match(/Found (\d+) errors?/)?.[1]
        if (errorCount) {
          errors.push(`\n  Total: ${errorCount} TypeScript errors found`)
        }
      } else {
        // Fallback: show raw output if regex didn't match
        errors.push(`  ${tscOutput.trim().split("\n").slice(0, 10).join("\n  ")}`)
      }
    }

    if (!lintPassed) {
      // Combine stdout and stderr for complete error output
      const lintOutput = [lintResult.stdout, lintResult.stderr].filter(Boolean).join("\n")

      // Analyze lint output - separate real errors from minified code noise
      const { realErrors, minifiedCount, hasMinifiedWarning } = analyzeLintOutput(lintOutput)

      // Warn about minified code being linted (eslint misconfiguration)
      if (hasMinifiedWarning) {
        errors.push("\n\n⚠️ ESLint Configuration Issue Detected:\n")
        errors.push(`  Found ${minifiedCount} errors in minified/bundled code.`)
        errors.push("  Your eslint config is likely missing ignores for dist/, build/, or node_modules/.")
        errors.push("  Add these to your eslint.config.* ignores array:")
        errors.push('    ignores: ["dist/**", "build/**", "node_modules/**", ".next/**"]')
        if (realErrors.length === 0) {
          errors.push("\n  (No real lint errors found after filtering minified code)")
        }
      }

      if (realErrors.length > 0) {
        errors.push("\n\n❌ Linting Errors (you should fix these before proceeding):\n")
        // Show first 10 real errors
        const displayErrors = realErrors.slice(0, 10)
        errors.push(...displayErrors.map(e => `  ${e}`))

        if (realErrors.length > 10) {
          errors.push(`\n  ... and ${realErrors.length - 10} more lint errors`)
        }
      } else if (!hasMinifiedWarning) {
        // No real errors and no minified warning - show raw output as fallback
        const relevantLines = lintOutput.trim().split("\n").slice(0, 10)
        errors.push("\n\n❌ Linting Errors:\n")
        errors.push(`  ${relevantLines.join("\n  ")}`)
      }
    }

    // Add guidance for fixing errors
    errors.push(
      "\n\n⚠️ Before you start fixing the errors, try to find the root cause. If you're sure you know the root cause, only if you're really sure, you can go ahead and fix it.",
    )

    // Note: This is NOT a tool error - the tool executed successfully and found code issues
    // Return as success with error details in the message (truncated to prevent overwhelming output)
    return successResult(truncateOutput(errors.join("\n")))
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return errorResult("Failed to run codebase check", errorMessage)
  }
}

export const checkCodebaseTool = tool(
  "check_codebase",
  "Runs TypeScript type checking (tsc) and ESLint to verify code quality. Use this BEFORE committing code, after making changes, or when debugging type errors. Returns detailed information about any TypeScript errors or lint warnings found. This is a comprehensive health check for the codebase.",
  checkCodebaseParamsSchema,
  async args => {
    return checkCodebase(args)
  },
)
