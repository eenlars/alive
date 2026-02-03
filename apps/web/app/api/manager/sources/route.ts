import { DEFAULTS } from "@webalive/shared"
import type { NextRequest } from "next/server"
import { requireManagerAuth } from "@/features/manager/lib/api-helpers"
import { createCorsSuccessResponse } from "@/lib/api/responses"
import {
  fetchCaddySources,
  fetchDnsSources,
  fetchFilesystemSources,
  fetchJsonSources,
  fetchSupabaseSources,
  fetchSystemdSources,
} from "@/lib/manager/source-fetchers"
import { fetchSourceSafely } from "@/lib/manager/source-utils"
import type { SourceData } from "@/types/sources"

const SERVER_IP = DEFAULTS.SERVER_IP

/**
 * Source fetcher registry for parallel execution
 */
const SOURCE_FETCHERS = [
  { name: "supabase", fetcher: fetchSupabaseSources },
  { name: "caddy", fetcher: fetchCaddySources },
  { name: "json", fetcher: fetchJsonSources },
  { name: "filesystem", fetcher: fetchFilesystemSources },
  { name: "systemd", fetcher: fetchSystemdSources },
] as const

/**
 * GET /api/manager/sources
 * Fetch domain data from all sources for comparison
 */
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin")

  const authError = await requireManagerAuth()
  if (authError) {
    return authError
  }

  const results = new Map<string, SourceData>()

  // Fetch all sources in parallel (except DNS which depends on having domains)
  await Promise.all(SOURCE_FETCHERS.map(({ name, fetcher }) => fetchSourceSafely(name, () => fetcher(results))))

  // DNS checks run after we have all domains
  await fetchSourceSafely("dns", () => fetchDnsSources(results, SERVER_IP))

  return createCorsSuccessResponse(origin, {
    sources: Array.from(results.values()).sort((a, b) => a.domain.localeCompare(b.domain)),
  })
}
