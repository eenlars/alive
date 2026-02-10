import { chown, mkdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { getRequiredDirectories, WORKSPACE_SCHEMA_VERSION, WORKSPACE_SCHEMA_VERSION_FILE } from "@webalive/shared"

/**
 * Ensure workspace conforms to the current schema version.
 * Creates missing directories and updates the version file.
 *
 * Fast path: reads .alive/.schema-version — if current, returns immediately.
 * Slow path: creates directories, writes version file, fixes ownership.
 */
export async function ensureWorkspaceSchema(workspacePath: string): Promise<void> {
  const versionFilePath = path.join(workspacePath, WORKSPACE_SCHEMA_VERSION_FILE)

  // Fast path: check version file
  try {
    const content = await readFile(versionFilePath, "utf8")
    const currentVersion = parseInt(content.trim(), 10)
    if (currentVersion >= WORKSPACE_SCHEMA_VERSION) return
  } catch {
    // File doesn't exist — need to initialize
  }

  // Get workspace ownership for correct permissions
  const workspaceStats = await stat(workspacePath)
  const { uid, gid } = workspaceStats

  // Create all required directories
  const dirs = getRequiredDirectories()
  for (const dir of dirs) {
    const fullPath = path.join(workspacePath, dir)
    await mkdir(fullPath, { recursive: true })
    await chown(fullPath, uid, gid)
  }

  // Write version file with correct ownership
  await writeFile(versionFilePath, String(WORKSPACE_SCHEMA_VERSION))
  await chown(versionFilePath, uid, gid)
}
