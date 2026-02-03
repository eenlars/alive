/**
 * Settings and system operations service - pure, testable functions
 */

export interface ServiceStatus {
  services: Array<{
    service: string
    status: "operational" | "degraded" | "offline"
    message: string
    latency?: number
  }>
  timestamp: string
}

export async function checkServiceStatus(): Promise<ServiceStatus> {
  const response = await fetch("/api/manager/service-status")

  if (!response.ok) {
    throw new Error("Failed to check service status")
  }

  return response.json()
}

export async function reloadCaddy(): Promise<void> {
  const response = await fetch("/api/manager/caddy/reload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })

  if (!response.ok) {
    throw new Error("Failed to reload Caddy")
  }
}

export async function backupWebsites(): Promise<void> {
  const response = await fetch("/api/manager/backup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })

  if (!response.ok) {
    throw new Error("Failed to backup websites")
  }
}

export interface CleanupStats {
  usersDeleted: number
  orgsDeleted: number
  domainsDeleted: number
  membershipsDeleted: number
  invitesDeleted: number
  sessionsDeleted: number
}

export async function cleanupTestData(preview: boolean): Promise<CleanupStats> {
  const response = await fetch("/api/manager/actions/cleanup-test-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preview }),
  })

  if (!response.ok) {
    throw new Error("Failed to cleanup test data")
  }

  return response.json()
}
