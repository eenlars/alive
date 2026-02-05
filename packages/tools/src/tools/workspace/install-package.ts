import { existsSync } from "node:fs"
import { join } from "node:path"
import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"
import { errorResult, successResult, type ToolResult } from "../../lib/api-client.js"
import { safeSpawnSync } from "../../lib/safe-spawn.js"
import { validateWorkspacePath } from "../../lib/workspace-validator.js"

export const installPackageParamsSchema = {
  packageName: z
    .string()
    .min(1)
    .max(214) // npm package name length limit
    .regex(
      /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/,
      "Invalid package name format. Must follow npm naming conventions.",
    )
    .describe("The npm/JavaScript package name to install (e.g., 'react', 'lodash', '@types/node')"),
  version: z
    .string()
    .regex(/^[\d.]+$|^\^[\d.]+$|^~[\d.]+$|^>=?[\d.]+$|^<=?[\d.]+$|^latest$|^next$/, "Invalid version format")
    .optional()
    .describe("Optional package version (e.g., '18.2.0', '^18.0.0', '~2.1.0', 'latest', 'next')"),
  dev: z.boolean().optional().describe("Whether to install as a dev dependency (default: false)"),
}

export type InstallPackageParams = {
  packageName: string
  version?: string
  dev?: boolean
}

/**
 * Install npm packages directly in workspace using bun.
 *
 * SECURITY MODEL (Direct Execution Pattern):
 * - This tool runs AFTER privilege drop (setuid/setgid to workspace user)
 * - Process already runs as workspace user, NOT root
 * - No HTTP roundtrip needed (previous API route ran as root - security risk)
 * - Files are owned by workspace user automatically
 * - Cache isolation prevents cross-workspace contamination
 *
 * This is the preferred pattern for workspace tools. Only use API calls
 * when root privileges are absolutely required (e.g., systemctl).
 */
export async function installPackage(params: InstallPackageParams): Promise<ToolResult> {
  const { packageName, version, dev = false } = params

  // Security: Use process.cwd() set by Bridge - never accept workspace from user
  const workspaceRoot = process.cwd()

  try {
    // Security: Validate workspace path
    validateWorkspacePath(workspaceRoot)

    // Verify package.json exists
    const packageJsonPath = join(workspaceRoot, "package.json")
    if (!existsSync(packageJsonPath)) {
      return errorResult("No package.json found in workspace", "This doesn't appear to be a Node.js project.")
    }

    // Build package specifier with optional version
    const packageSpec = version ? `${packageName}@${version}` : packageName
    const args = dev ? ["add", "-D", packageSpec] : ["add", packageSpec]

    // Execute bun install directly - we're already running as workspace user
    // after privilege drop (setuid/setgid in run-agent.mjs)
    const result = safeSpawnSync("bun", args, {
      cwd: workspaceRoot,
      timeout: 60000,
    })

    if (result.status !== 0) {
      const errorOutput = result.stderr || result.stdout || "Unknown error"
      return errorResult(`Failed to install ${packageSpec}`, `Exit code: ${result.status}\n\n${errorOutput.trim()}`)
    }

    return successResult(
      `Successfully installed ${packageSpec}${dev ? " (dev dependency)" : ""}. The dev server will auto-restart to apply changes.`,
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return errorResult(`Failed to install ${packageName}${version ? `@${version}` : ""}`, errorMessage)
  }
}

export const installPackageTool = tool(
  "install_package",
  "Installs JavaScript/npm packages in the user's workspace using bun. IMPORTANT: This tool is ONLY for JavaScript packages from npm (e.g., react, lodash, @types/node). Do NOT use for Python, system packages, or non-JS dependencies. The installation runs in the user's workspace with proper isolation and security. Use this when the user needs to add new npm dependencies to their Node.js/JavaScript project.",
  installPackageParamsSchema,
  async args => {
    return installPackage(args)
  },
)
