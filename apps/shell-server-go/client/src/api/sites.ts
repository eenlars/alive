import type { SitesResponse } from "../types/api"

export async function fetchSites(): Promise<SitesResponse> {
  const res = await fetch("/api/sites")
  return res.json()
}
