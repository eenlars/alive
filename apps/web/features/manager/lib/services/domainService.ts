/**
 * Domain management service - pure, testable functions
 */

export interface DomainDeleteRequest {
  domain: string
}

export interface PermissionCheckRequest {
  domain: string
}

export interface FixPortRequest {
  domain: string
}

export interface PermissionCheckResult {
  domain: string
  expectedOwner: string
  siteDirectoryExists: boolean
  totalFiles: number
  rootOwnedFiles: number
  wrongOwnerFiles: number
  rootOwnedFilesList: string[]
  wrongOwnerFilesList: string[]
  error?: string
}

export async function deleteDomain(domain: string): Promise<void> {
  const response = await fetch("/api/manager", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain }),
  })

  if (!response.ok) {
    throw new Error("Failed to delete domain")
  }
}

export async function checkPermissions(domain: string): Promise<PermissionCheckResult> {
  const response = await fetch(`/api/manager/permissions?domain=${encodeURIComponent(domain)}`, {
    method: "GET",
  })

  if (!response.ok) {
    throw new Error("Failed to check permissions")
  }

  const data = await response.json()
  return data.result
}

export async function fixPort(domain: string): Promise<void> {
  const response = await fetch("/api/manager/vite-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain, action: "fix-port" }),
  })

  if (!response.ok) {
    throw new Error("Failed to fix port")
  }
}

export async function fixPermissions(domain: string): Promise<{ result: PermissionCheckResult }> {
  const response = await fetch("/api/manager/permissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain, action: "fix" }),
  })

  if (!response.ok) {
    throw new Error("Failed to fix permissions")
  }

  return response.json()
}
