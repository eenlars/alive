/**
 * Container workspace detection utilities.
 * Used by command-runner and agent-child-runner to route
 * execution through Incus containers instead of host privilege drop.
 */

const CONTAINER_ROOTFS_MARKER = "/incus/storage-pools/"
const CONTAINER_NAME_REGEX = /\/containers\/([^/]+)\/rootfs/

/**
 * Check if a workspace path is inside an Incus container rootfs.
 * Works with both direct rootfs paths and bind mounts that resolve
 * to container rootfs paths.
 */
export function isContainerWorkspace(workspaceRoot: string): boolean {
  return workspaceRoot.includes(CONTAINER_ROOTFS_MARKER)
}

/**
 * Extract container name from a rootfs-based workspace path.
 * e.g., /var/lib/incus/storage-pools/alive-test/containers/tenant-example-com/rootfs/srv/site/user
 * → "tenant-example-com"
 */
export function extractContainerName(workspaceRoot: string): string {
  const match = workspaceRoot.match(CONTAINER_NAME_REGEX)
  if (!match) {
    throw new Error(`Cannot extract container name from workspace path: ${workspaceRoot}`)
  }
  return match[1]
}

/**
 * Convert a host rootfs path to the corresponding path inside the container.
 * Strips everything before and including /rootfs.
 * e.g., /var/lib/incus/.../rootfs/srv/site/user → /srv/site/user
 */
export function rootfsToContainerPath(hostPath: string): string {
  const idx = hostPath.indexOf("/rootfs")
  if (idx === -1) return hostPath
  return hostPath.slice(idx + "/rootfs".length) || "/"
}

/**
 * Check if a domain maps to a container workspace via bind mount.
 * Returns the container name if the workspace at /srv/webalive/sites/{domain}/user
 * is a bind mount from a container rootfs.
 *
 * For the experiment: we check a hardcoded mapping.
 * In production this would query the DB or inspect mount points.
 */
const CONTAINER_DOMAIN_MAP: Record<string, string> = {
  "incus-demo.sonno.tech": "tenant-demo",
}

export function getContainerForDomain(domain: string): string | null {
  return CONTAINER_DOMAIN_MAP[domain] ?? null
}
