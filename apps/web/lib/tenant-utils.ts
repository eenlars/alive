/**
 * Tenant ID utilities for image storage
 */

export function workspaceToTenantId(workspace: string): string {
  // Convert workspace path to tenant ID
  // Examples:
  // /srv/webalive/sites/demo.goalive.nl/user/src -> demo.goalive.nl
  // /srv/webalive/sites/homable.nl/user -> homable.nl

  const normalized = workspace.replace(/\/+$/, "") // Remove trailing slashes
  const match = normalized.match(/\/srv\/webalive\/sites\/([^/]+)/)

  if (match) {
    return match[1] // Extract domain from path
  }

  // Fallback: use last part of workspace path
  const parts = normalized.split("/")
  return parts[parts.length - 1] || "unknown"
}
