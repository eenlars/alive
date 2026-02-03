import { exec } from "node:child_process"
import dns from "node:dns"
import { promises as fs } from "node:fs"
import { promisify } from "node:util"
import { PATHS } from "@webalive/shared"
import { getAllDomains } from "@/lib/deployment/domain-registry"
import type { SourceData } from "@/types/sources"
import { ensureDomain, isPreviewDomain } from "./source-utils"

const execAsync = promisify(exec)
const dnsResolve = promisify(dns.resolve4)

/**
 * Fetch domains from Supabase
 */
export async function fetchSupabaseSources(results: Map<string, SourceData>): Promise<void> {
  const supabaseDomains = await getAllDomains()

  for (const domain of supabaseDomains) {
    if (isPreviewDomain(domain.hostname)) continue

    const domainData = ensureDomain(results, domain.hostname)
    domainData.supabase = {
      exists: true,
      port: domain.port,
      orgId: domain.orgId,
      email: domain.ownerEmail,
    }
  }
}

/**
 * Fetch domains from Caddy configuration file
 */
export async function fetchCaddySources(results: Map<string, SourceData>): Promise<void> {
  const caddyContent = await fs.readFile(PATHS.CADDYFILE_PATH, "utf-8")
  const lines = caddyContent.split("\n")

  let currentDomain: string | null = null

  for (const line of lines) {
    const domainMatch = line.match(/^([a-zA-Z0-9.-]+)\s+\{/)
    if (domainMatch) {
      currentDomain = domainMatch[1]
      if (!isPreviewDomain(currentDomain)) {
        const domainData = ensureDomain(results, currentDomain)
        domainData.caddy.exists = true
      }
    }

    const portMatch = line.match(/reverse_proxy\s+localhost:(\d+)/)
    if (portMatch && currentDomain && !isPreviewDomain(currentDomain)) {
      const domainData = ensureDomain(results, currentDomain)
      domainData.caddy.port = Number.parseInt(portMatch[1], 10)
    }
  }
}

/**
 * Fetch domains from JSON password registry
 */
export async function fetchJsonSources(results: Map<string, SourceData>): Promise<void> {
  const jsonContent = await fs.readFile(PATHS.REGISTRY_PATH, "utf-8")
  const jsonData = JSON.parse(jsonContent)

  for (const [domain, config] of Object.entries(jsonData)) {
    if (isPreviewDomain(domain)) continue

    const port = (config as { port?: number }).port
    const domainData = ensureDomain(results, domain)
    domainData.json = {
      exists: true,
      port: port ?? null,
    }
  }
}

/**
 * Fetch domains from filesystem (/srv/webalive/sites/)
 */
export async function fetchFilesystemSources(results: Map<string, SourceData>): Promise<void> {
  const sitesDir = PATHS.SITES_ROOT
  const entries = await fs.readdir(sitesDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const domain = entry.name
    if (isPreviewDomain(domain)) continue

    const fullPath = `${sitesDir}/${domain}`
    const domainData = ensureDomain(results, domain)
    domainData.filesystem = {
      exists: true,
      path: fullPath,
    }
  }
}

/**
 * Check serve mode from systemd override file
 */
async function checkServeMode(slug: string): Promise<"dev" | "build" | "unknown"> {
  const overridePath = `/etc/systemd/system/site@${slug}.service.d/override.conf`
  try {
    const { stdout } = await execAsync(`cat "${overridePath}" 2>/dev/null || echo ""`)
    if (stdout.includes("preview")) return "build"
    if (stdout.includes("dev") || stdout.trim() === "") return "dev"
    return "dev"
  } catch {
    return "dev"
  }
}

/**
 * Fetch systemd service status for domains
 */
export async function fetchSystemdSources(results: Map<string, SourceData>): Promise<void> {
  const { stdout: services } = await execAsync("systemctl list-units 'site@*.service' --no-legend --no-pager")
  const serviceMatches = services.matchAll(/site@([a-zA-Z0-9-]+)\.service\s+loaded\s+(\w+)/g)

  const updates: Promise<void>[] = []

  for (const match of serviceMatches) {
    const slug = match[1]
    const domain = slug.replace(/-/g, ".")
    const state = match[2]

    if (isPreviewDomain(domain)) continue

    // Only update if domain already exists (systemd doesn't create new domains)
    if (results.has(domain)) {
      updates.push(
        checkServeMode(slug).then(serveMode => {
          const domainData = results.get(domain)!
          domainData.systemd = {
            exists: true,
            active: state === "active",
            serveMode,
          }
        }),
      )
    }
  }

  await Promise.all(updates)
}

/**
 * Perform DNS resolution checks for all domains
 */
export async function fetchDnsSources(results: Map<string, SourceData>, serverIp: string): Promise<void> {
  const dnsPromises = Array.from(results.keys()).map(async domain => {
    try {
      const ips = await dnsResolve(domain)
      const domainData = results.get(domain)!
      domainData.dns = {
        resolves: true,
        ips,
        matchesServer: ips.includes(serverIp),
      }
    } catch {
      // DNS resolution failed - keep default values
      const domainData = results.get(domain)!
      domainData.dns.resolves = false
    }
  })

  await Promise.all(dnsPromises)
}
