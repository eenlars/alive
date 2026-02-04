import { existsSync, statSync } from "node:fs"
import { copyFile, mkdir, realpath } from "node:fs/promises"
import { join } from "node:path"
import { tool } from "@anthropic-ai/claude-agent-sdk"
import { resolveAndValidatePath } from "@webalive/shared"
import { z } from "zod"
import { type ToolResult, errorResult, successResult } from "../../lib/api-client.js"
import { validateWorkspacePath } from "../../lib/workspace-validator.js"
import {
  generateUsageInstructions,
  getAssetPath,
  getAssetToolDescription,
  getManifest,
  listAssets,
} from "../../lib/assets.js"

export const copySharedAssetParamsSchema = {
  asset: z.string().min(1).describe("Asset to copy (e.g., 'fonts/satoshi')"),
  dest: z
    .string()
    .optional()
    .describe("Destination path relative to workspace (default: asset's suggested destination)"),
}

export type CopySharedAssetParams = {
  asset: string
  dest?: string
}

/**
 * Copy shared assets to workspace.
 *
 * SECURITY MODEL (Direct Execution Pattern):
 * - Runs AFTER privilege drop (setuid/setgid to workspace user)
 * - Files are owned by workspace user automatically
 * - Asset whitelist prevents arbitrary file access
 * - Uses resolveAndValidatePath from @webalive/shared (DRY)
 */
export async function copySharedAsset(params: CopySharedAssetParams): Promise<ToolResult> {
  const { asset, dest } = params
  const workspaceRoot = process.cwd()

  console.error(`[copy_shared_asset] Starting: asset=${asset}, dest=${dest || "(default)"}, cwd=${workspaceRoot}`)

  try {
    validateWorkspacePath(workspaceRoot)

    const manifest = getManifest()
    const assetConfig = manifest[asset]

    if (!assetConfig) {
      console.error(`[copy_shared_asset] Unknown asset: ${asset}. Available: ${listAssets().join(", ")}`)
      return errorResult(`Unknown asset: ${asset}`, `Available: ${listAssets().join(", ")}`)
    }

    // Use existing path validation from @webalive/shared (DRY!)
    const destDir = dest || assetConfig.suggestedDest
    const validation = resolveAndValidatePath(destDir, workspaceRoot)
    if (!validation.valid) {
      console.error(`[copy_shared_asset] Invalid destination: ${destDir} - ${validation.error}`)
      return errorResult("Invalid destination", validation.error || "Path must be within workspace")
    }

    const sourcePath = getAssetPath(asset)
    console.error(`[copy_shared_asset] Source path: ${sourcePath}`)

    if (!existsSync(sourcePath)) {
      console.error(`[copy_shared_asset] ERROR: Source directory does not exist: ${sourcePath}`)
      console.error("[copy_shared_asset] This usually means the assets were not copied to dist/ during build.")
      console.error("[copy_shared_asset] Run: cd packages/tools && bun run build")
      return errorResult(
        "Asset source not found",
        `The asset directory "${sourcePath}" does not exist. This is a build issue - assets may not have been copied to dist/.`,
      )
    }

    // Security: Resolve symlinks to ensure final path is still in workspace
    console.error(`[copy_shared_asset] Creating directory: ${validation.resolvedPath}`)
    await mkdir(validation.resolvedPath, { recursive: true })
    const realDestPath = await realpath(validation.resolvedPath)
    console.error(`[copy_shared_asset] Real destination path: ${realDestPath}`)

    if (!realDestPath.startsWith(workspaceRoot)) {
      console.error(
        `[copy_shared_asset] SECURITY: Symlink escape attempt! realDestPath=${realDestPath}, workspaceRoot=${workspaceRoot}`,
      )
      return errorResult("Invalid destination", "Symlink points outside workspace")
    }

    const copiedFiles: string[] = []
    const skippedFiles: string[] = []

    console.error(`[copy_shared_asset] Copying ${assetConfig.files.length} files from manifest`)

    for (const file of assetConfig.files) {
      const src = join(sourcePath, file)
      const dst = join(realDestPath, file)

      if (!existsSync(src)) {
        console.error(`[copy_shared_asset] Source file not found, skipping: ${src}`)
        skippedFiles.push(file)
        continue
      }

      // Check if destination is a directory (would cause confusing error)
      if (existsSync(dst) && statSync(dst).isDirectory()) {
        console.error(`[copy_shared_asset] ERROR: Destination is a directory: ${dst}`)
        return errorResult("Cannot overwrite directory", `${dst} is a directory, not a file`)
      }

      console.error(`[copy_shared_asset] Copying: ${src} -> ${dst}`)
      await copyFile(src, dst)
      copiedFiles.push(file)
    }

    if (copiedFiles.length === 0) {
      console.error(`[copy_shared_asset] ERROR: No files copied. All source files missing: ${skippedFiles.join(", ")}`)
      return errorResult("No files copied", `All source files missing: ${skippedFiles.join(", ")}`)
    }

    console.error(`[copy_shared_asset] SUCCESS: Copied ${copiedFiles.length} files to ${destDir}`)

    // Generate usage instructions based on actual destination
    const usage = generateUsageInstructions(assetConfig.primaryFile, destDir)

    const result = [`Copied ${copiedFiles.length} file(s) to ${destDir}/`, copiedFiles.map(f => `  - ${f}`).join("\n")]

    if (skippedFiles.length > 0) {
      result.push(`\nSkipped (not found): ${skippedFiles.join(", ")}`)
    }

    result.push(
      "",
      "**Add to index.html <head>:**",
      "```html",
      usage.preload,
      "```",
      "",
      "**Add to CSS:**",
      "```css",
      usage.css,
      "```",
    )

    return successResult(result.join("\n"))
  } catch (error) {
    // Provide helpful messages for common errors
    const errMsg = error instanceof Error ? error.message : String(error)
    const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined

    console.error(`[copy_shared_asset] EXCEPTION: ${errMsg}`)
    console.error(`[copy_shared_asset] Error code: ${code || "none"}`)
    if (error instanceof Error && error.stack) {
      console.error(`[copy_shared_asset] Stack trace:\n${error.stack}`)
    }

    if (code === "ENOSPC") {
      return errorResult("Disk full", "Not enough space to copy files")
    }
    if (code === "EACCES" || code === "EPERM") {
      return errorResult("Permission denied", `Cannot write to destination: ${errMsg}`)
    }
    if (code === "ENOENT") {
      return errorResult("File or directory not found", errMsg)
    }

    return errorResult(`Failed to copy ${asset}`, errMsg)
  }
}

export const copySharedAssetTool = tool(
  "copy_shared_asset",
  getAssetToolDescription(), // Generated from manifest (DRY!)
  copySharedAssetParamsSchema,
  async args => copySharedAsset(args),
)
