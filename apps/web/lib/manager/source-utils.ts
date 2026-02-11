import type { SourceData } from "@/types/sources"

/**
 * Create an empty SourceData structure with all sources set to defaults
 */
export function createEmptySourceData(domain: string): SourceData {
  return {
    domain,
    supabase: { exists: false, port: null, orgId: null, email: null },
    caddy: { exists: false, port: null },
    filesystem: { exists: false, path: null },
    dns: { resolves: false, ips: [], matchesServer: false },
    systemd: { exists: false, active: false, serveMode: "unknown" },
  }
}

/**
 * Check if a domain is a preview domain (contains .preview.)
 */
export function isPreviewDomain(domain: string): boolean {
  return domain.includes(".preview.")
}

/**
 * Ensure a domain exists in the results map, creating it if missing
 * Returns the SourceData for the domain
 */
export function ensureDomain(results: Map<string, SourceData>, domain: string): SourceData {
  if (!results.has(domain)) {
    results.set(domain, createEmptySourceData(domain))
  }
  return results.get(domain)!
}

/**
 * Update a specific source's data for a domain
 */
export function updateSourceData<K extends keyof SourceData>(
  results: Map<string, SourceData>,
  domain: string,
  sourceKey: K,
  data: SourceData[K],
): void {
  const domainData = ensureDomain(results, domain)
  domainData[sourceKey] = data
}

/**
 * Wrap an async source fetcher with error handling
 */
export async function fetchSourceSafely<T>(name: string, fetcher: () => Promise<T>): Promise<T | null> {
  try {
    return await fetcher()
  } catch (error) {
    console.error(`[Manager Sources] Failed to fetch ${name}:`, error)
    return null
  }
}
