import { chown, mkdir, stat } from "node:fs/promises"
import path from "node:path"

/** Derive drive path from workspace path: /sites/{domain}/user → /sites/{domain}/drive */
export function getDrivePath(workspacePath: string): string {
  return path.resolve(workspacePath, "..", "drive")
}

/** Ensure drive dir exists with correct ownership (matching /user) */
export async function ensureDriveDir(workspacePath: string): Promise<string> {
  const drivePath = getDrivePath(workspacePath)
  await mkdir(drivePath, { recursive: true })
  const userStats = await stat(workspacePath)
  await chown(drivePath, userStats.uid, userStats.gid)
  return drivePath
}
