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
 * Fetch domains from filesystem (/srv/webalive/sites/ and /srv/webalive/templates/)
 */
export async function fetchFilesystemSources(results: Map<string, SourceData>): Promise<void> {
  for (const dir of [PATHS.SITES_ROOT, PATHS.TEMPLATES_ROOT]) {
    let names: string[]
    try {
      names = await fs.readdir(dir)
    } catch {
      continue // Directory may not exist on all servers
    }

    for (const name of names) {
      const fullPath = `${dir}/${name}`
      const stat = await fs.stat(fullPath).catch(() => null)
      if (!stat?.isDirectory()) continue
      if (isPreviewDomain(name)) continue

      const domainData = ensureDomain(results, name)
      domainData.filesystem = {
        exists: true,
        path: fullPath,
      }
    }
  }
}

/**
 * Check serve mode from systemd override file
 */
async function checkServeMode(
  slug: string,
  prefix: "site" | "template" = "site",
): Promise<"dev" | "build" | "unknown"> {
  const overridePath = `/etc/systemd/system/${prefix}@${slug}.service.d/override.conf`
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
 * Fetch systemd service status for domains.
 * Checks both site@*.service and template@*.service units.
 */
export async function fetchSystemdSources(results: Map<string, SourceData>): Promise<void> {
  const [{ stdout: siteServices }, { stdout: templateServices }] = await Promise.all([
    execAsync("systemctl list-units 'site@*.service' --no-legend --no-pager"),
    execAsync("systemctl list-units 'template@*.service' --no-legend --no-pager"),
  ])

  const updates: Promise<void>[] = []

  for (const [prefix, output] of [
    ["site", siteServices],
    ["template", templateServices],
  ] as const) {
    const regex = new RegExp(`${prefix}@([a-zA-Z0-9-]+)\\.service\\s+loaded\\s+(\\w+)`, "g")
    for (const match of output.matchAll(regex)) {
      const slug = match[1]
      const domain = slug.replace(/-/g, ".")
      const state = match[2]

      if (isPreviewDomain(domain)) continue

      if (results.has(domain)) {
        updates.push(
          checkServeMode(slug, prefix).then(serveMode => {
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
