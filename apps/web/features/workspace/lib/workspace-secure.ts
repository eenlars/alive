import * as crypto from "node:crypto"
import * as fs from "node:fs"
import * as path from "node:path"
import { PATHS } from "@webalive/shared"

export interface Workspace {
  root: string
  uid: number
  gid: number
  tenantId: string
}

/**
 * Maps host to canonical tenant identifier
 * Handles domain aliases like barendbootsma-com -> barendbootsma.com
 */
function hostToTenantId(host: string): string {
  // Handle common alias patterns
  const aliasMap: Record<string, string> = {
    "barendbootsma-com": "barendbootsma.com",
    // Add other aliases as needed
  }

  return aliasMap[host] || host
}

/**
 * Resolves workspace with proper containment checks and canonical tenant resolution
 * Implements Patrick's invariant: "Given a host, we resolve to the one true workspace on disk"
 */
export function resolveWorkspace(host: string): string {
  const BASE = process.env.WORKSPACE_BASE ?? PATHS.SITES_ROOT

  // 1) Translate host→tenant (don't couple on the display domain)
  const tenant = hostToTenantId(host.toLowerCase())

  // 2) Compose the intended path
  const intended = path.join(BASE, tenant, "user", "src")

  // 3) Resolve symlinks and enforce containment
  const real = fs.realpathSync(intended)
  const baseReal = fs.realpathSync(BASE)

  if (!real.startsWith(baseReal + path.sep)) {
    throw new Error("Workspace resolution escaped base")
  }

  return real
}

/**
 * Gets complete workspace information with ownership details
 * Single source of truth for workspace resolution + identity
 */
export function getWorkspace(host: string): Workspace {
  const root = resolveWorkspace(host)
  const st = fs.statSync(root)

  return {
    root,
    uid: st.uid,
    gid: st.gid,
    tenantId: hostToTenantId(host.toLowerCase()),
  }
}

/**
 * Atomic write helper with proper ownership and durability
 * Implements Patrick's invariant: "All edits happen as the workspace owner, not as whoever is running the bridge"
 */
export function writeAsWorkspaceOwner(
  filePath: string,
  content: Buffer | string,
  workspace: { uid: number; gid: number },
) {
  const dir = path.dirname(filePath)
  const tmp = path.join(dir, `.tmp-${crypto.randomUUID()}`)

  // Create temp exclusively; don't follow symlinks on the temp name
  const fd = fs.openSync(tmp, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o644)
  try {
    if (typeof content === "string") content = Buffer.from(content)
    fs.writeFileSync(fd, content)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }

  // Ensure ownership is correct *before* the rename; ownership persists across rename
  fs.chownSync(tmp, workspace.uid, workspace.gid)

  // Atomic replace
  fs.renameSync(tmp, filePath)

  // Durability: fsync the containing directory so the rename is persisted
  const dfd = fs.openSync(dir, fs.constants.O_RDONLY)
  try {
    fs.fsyncSync(dfd)
  } finally {
    fs.closeSync(dfd)
  }
}

/**
 * Containment guard for file operations
 * Must be called before any file operation to ensure path is within workspace
 */
export function ensurePathWithinWorkspace(filePath: string, workspaceRoot: string): void {
  const norm = path.normalize(filePath)
  if (!norm.startsWith(workspaceRoot + path.sep)) {
    throw new Error(`Path outside workspace: ${norm}`)
  }
}

/**
 * Edit existing file with proper ownership
 * Uses temporary file for atomic replacement
 */
export function editAsWorkspaceOwner(
  filePath: string,
  editFn: (content: string) => string,
  workspace: { uid: number; gid: number },
) {
  // Read existing content
  const existingContent = fs.readFileSync(filePath, "utf8")

  // Apply edit function
  const newContent = editFn(existingContent)

  // Write atomically with correct ownership
  writeAsWorkspaceOwner(filePath, newContent, workspace)
}
