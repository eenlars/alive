import {
  resolve4,
  resolve6,
  resolveCaa,
  resolveCname,
  resolveMx,
  resolveNs,
  resolveSoa,
  resolveTxt,
} from "node:dns/promises"
import { connect as netConnect, type Socket } from "node:net"
import type { Request, Response, Router } from "express"

// ---------------------------------------------------------------------------
// Subdomain discovery via Certificate Transparency + DNS brute-force
// ---------------------------------------------------------------------------

const COMMON_SUBDOMAINS = [
  "www",
  "mail",
  "remote",
  "blog",
  "webmail",
  "server",
  "ns1",
  "ns2",
  "smtp",
  "secure",
  "vpn",
  "m",
  "shop",
  "ftp",
  "mail2",
  "test",
  "portal",
  "ns",
  "ww1",
  "host",
  "support",
  "dev",
  "web",
  "bbs",
  "ww42",
  "mx",
  "email",
  "cloud",
  "1",
  "mail1",
  "2",
  "forum",
  "owa",
  "www2",
  "gw",
  "admin",
  "store",
  "mx1",
  "cdn",
  "api",
  "exchange",
  "app",
  "gov",
  "2tty",
  "vps",
  "govyty",
  "hubs",
  "edu",
  "media",
  "gateway",
  "stats",
  "img",
  "assets",
  "cms",
  "staging",
  "demo",
  "stage",
  "beta",
  "internal",
  "intranet",
  "auth",
  "sso",
  "login",
  "dashboard",
  "panel",
  "cp",
  "status",
  "docs",
  "doc",
  "help",
  "kb",
  "wiki",
  "git",
  "gitlab",
  "jenkins",
  "ci",
  "cd",
  "deploy",
  "monitor",
  "grafana",
  "prometheus",
  "elastic",
  "kibana",
  "redis",
  "db",
  "database",
  "sql",
  "mysql",
  "postgres",
  "mongo",
  "cache",
  "search",
  "es",
  "queue",
  "mq",
  "rabbit",
  "kafka",
  "s3",
  "storage",
  "backup",
  "logs",
  "sentry",
  "track",
  "analytics",
  "events",
  "webhook",
  "ws",
  "socket",
  "realtime",
  "push",
  "notify",
  "calendar",
  "crm",
  "erp",
  "billing",
  "pay",
  "payment",
  "checkout",
  "order",
  "cart",
  "static",
  "images",
  "img2",
  "video",
  "files",
  "download",
  "upload",
  "proxy",
  "lb",
  "relay",
  "edge",
  "origin",
  "node1",
  "node2",
  "worker",
  "cron",
  "job",
  "task",
  "service",
  "svc",
]

type SubdomainResult = {
  subdomain: string
  source: "ct" | "dns"
  ip?: string[]
}

async function queryCertTransparency(domain: string): Promise<string[]> {
  try {
    const resp = await fetch(`https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`, {
      signal: AbortSignal.timeout(15_000),
    })
    if (!resp.ok) return []

    const entries = (await resp.json()) as Array<{ name_value: string }>
    const subdomains = new Set<string>()
    for (const entry of entries) {
      for (const name of entry.name_value.split("\n")) {
        const clean = name.trim().toLowerCase().replace(/^\*\./, "")
        if (clean.endsWith(`.${domain}`) && clean !== domain) {
          subdomains.add(clean)
        }
      }
    }
    return [...subdomains]
  } catch {
    return []
  }
}

async function resolveSubdomain(fqdn: string): Promise<string[] | null> {
  try {
    const ips = await resolve4(fqdn)
    return ips.length > 0 ? ips : null
  } catch {
    try {
      const ips = await resolve6(fqdn)
      return ips.length > 0 ? ips.map(String) : null
    } catch {
      return null
    }
  }
}

async function extractDnsSubdomains(domain: string): Promise<string[]> {
  const found = new Set<string>()

  const extract = (hostname: string) => {
    const clean = hostname.replace(/\.$/, "").toLowerCase()
    if (clean.endsWith(`.${domain}`) && clean !== domain) {
      found.add(clean)
    }
  }

  await Promise.allSettled([
    resolveMx(domain).then(records =>
      records.forEach(r => {
        extract(r.exchange)
      }),
    ),
    resolveNs(domain).then(records =>
      records.forEach(r => {
        extract(r)
      }),
    ),
    resolveCname(domain)
      .then(records =>
        records.forEach(r => {
          extract(r)
        }),
      )
      .catch(() => {}),
    resolveTxt(domain).then(records => {
      for (const chunks of records) {
        const txt = chunks.join("")
        const matches = txt.match(/include:([^\s]+)/g)
        if (matches) {
          for (const m of matches) {
            extract(m.replace("include:", ""))
          }
        }
      }
    }),
  ])

  return [...found]
}

function cleanDomainInput(domain: string): string {
  return domain.includes("://") ? new URL(domain).hostname : domain.replace(/\/.*$/, "").toLowerCase()
}

// ---------------------------------------------------------------------------
// DNS records
// ---------------------------------------------------------------------------

type DnsRecordSet = {
  A?: string[]
  AAAA?: string[]
  MX?: Array<{ priority: number; exchange: string }>
  NS?: string[]
  TXT?: string[]
  CNAME?: string[]
  SOA?: {
    nsname: string
    hostmaster: string
    serial: number
    refresh: number
    retry: number
    expire: number
    minttl: number
  } | null
  CAA?: Array<Record<string, unknown>>
}

async function resolveAllDns(domain: string): Promise<DnsRecordSet> {
  const result: DnsRecordSet = {}

  const tasks: Array<Promise<void>> = [
    resolve4(domain)
      .then(r => {
        result.A = r
      })
      .catch(() => {}),
    resolve6(domain)
      .then(r => {
        result.AAAA = r
      })
      .catch(() => {}),
    resolveMx(domain)
      .then(r => {
        result.MX = r.sort((a, b) => a.priority - b.priority)
      })
      .catch(() => {}),
    resolveNs(domain)
      .then(r => {
        result.NS = r
      })
      .catch(() => {}),
    resolveTxt(domain)
      .then(r => {
        result.TXT = r.map(chunks => chunks.join(""))
      })
      .catch(() => {}),
    resolveCname(domain)
      .then(r => {
        result.CNAME = r
      })
      .catch(() => {}),
    resolveSoa(domain)
      .then(r => {
        result.SOA = r
      })
      .catch(() => {
        result.SOA = null
      }),
    resolveCaa(domain)
      .then(r => {
        result.CAA = r.map(rec => ({ ...rec }))
      })
      .catch(() => {}),
  ]

  await Promise.allSettled(tasks)
  return result
}

// ---------------------------------------------------------------------------
// WHOIS via RDAP
// ---------------------------------------------------------------------------

const RDAP_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json"
let rdapServers: Map<string, string> | null = null

async function getRdapServer(domain: string): Promise<string | null> {
  if (!rdapServers) {
    try {
      const resp = await fetch(RDAP_BOOTSTRAP_URL, { signal: AbortSignal.timeout(10_000) })
      const data = (await resp.json()) as { services: Array<[string[], string[]]> }
      rdapServers = new Map()
      for (const [tlds, urls] of data.services) {
        const server = urls.find(u => u.startsWith("https://")) ?? urls[0]
        if (server) {
          for (const tld of tlds) {
            rdapServers.set(tld.toLowerCase(), server.replace(/\/$/, ""))
          }
        }
      }
    } catch {
      return null
    }
  }

  const parts = domain.split(".")
  for (let i = 0; i < parts.length; i++) {
    const tld = parts.slice(i).join(".")
    const server = rdapServers.get(tld)
    if (server) return server
  }
  return null
}

type WhoisResult = {
  domain: string
  status?: string[]
  registrar?: string
  registrarUrl?: string
  created?: string
  updated?: string
  expires?: string
  nameservers?: string[]
  dnssec?: boolean
  raw?: unknown
}

function extractWhoisFromRdap(rdap: Record<string, unknown>): WhoisResult {
  const result: WhoisResult = { domain: "" }

  result.domain = (rdap.ldhName as string) ?? ""
  result.status = (rdap.status as string[]) ?? []

  const events = (rdap.events as Array<{ eventAction: string; eventDate: string }>) ?? []
  for (const ev of events) {
    if (ev.eventAction === "registration") result.created = ev.eventDate
    if (ev.eventAction === "expiration") result.expires = ev.eventDate
    if (ev.eventAction === "last changed") result.updated = ev.eventDate
  }

  const entities =
    (rdap.entities as Array<{
      roles?: string[]
      vcardArray?: unknown[]
      publicIds?: Array<{ identifier: string }>
      handle?: string
    }>) ?? []
  for (const entity of entities) {
    if (entity.roles?.includes("registrar")) {
      const vcard = entity.vcardArray as Array<unknown> | undefined
      if (Array.isArray(vcard) && vcard.length >= 2 && Array.isArray(vcard[1])) {
        for (const prop of vcard[1] as Array<unknown[]>) {
          if (Array.isArray(prop) && prop[0] === "fn") {
            result.registrar = String(prop[3])
            break
          }
        }
      }
      if (!result.registrar && entity.handle) {
        result.registrar = entity.handle
      }
      const links = (entity as Record<string, unknown>).links as Array<{ rel?: string; href?: string }> | undefined
      if (links) {
        const self = links.find(l => l.rel === "self")
        if (self) result.registrarUrl = self.href
      }
    }
  }

  const nameservers = (rdap.nameservers as Array<{ ldhName: string }>) ?? []
  if (nameservers.length > 0) {
    result.nameservers = nameservers.map(ns => ns.ldhName.toLowerCase())
  }

  const secureDns = rdap.secureDNS as { delegationSigned?: boolean } | undefined
  if (secureDns) {
    result.dnssec = secureDns.delegationSigned ?? false
  }

  return result
}

// ---------------------------------------------------------------------------
// Port scanner
// ---------------------------------------------------------------------------

const DEFAULT_PORTS: Record<number, string> = {
  21: "FTP",
  22: "SSH",
  25: "SMTP",
  53: "DNS",
  80: "HTTP",
  110: "POP3",
  143: "IMAP",
  443: "HTTPS",
  465: "SMTPS",
  587: "SMTP/TLS",
  993: "IMAPS",
  995: "POP3S",
  1433: "MSSQL",
  1434: "MSSQL-UDP",
  3306: "MySQL",
  3389: "RDP",
  5432: "PostgreSQL",
  5900: "VNC",
  6379: "Redis",
  8080: "HTTP-Alt",
  8443: "HTTPS-Alt",
  9200: "Elasticsearch",
  27017: "MongoDB",
}

const PORT_SCAN_TIMEOUT_MS = 3_000
const PORT_SCAN_CONCURRENCY = 15

function tcpProbe(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<{ port: number; open: boolean; banner?: string }> {
  return new Promise(resolve => {
    let settled = false
    const settle = (open: boolean, banner?: string) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve({ port, open, banner })
    }

    const socket: Socket = netConnect({ host, port, timeout: timeoutMs }, () => {
      socket.setTimeout(1000)
      socket.once("data", data => {
        const banner = data.toString("utf-8").trim().slice(0, 200)
        settle(true, banner || undefined)
      })
      socket.once("timeout", () => settle(true))
    })

    socket.on("error", () => settle(false))
    socket.on("timeout", () => settle(false))
  })
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerReconRoutes(router: Router): void {
  // Subdomain discovery
  router.get("/discover-subdomains/wordlist", (_req: Request, res: Response) => {
    res.json({ count: COMMON_SUBDOMAINS.length, wordlist: COMMON_SUBDOMAINS })
  })

  router.post("/discover-subdomains", async (req: Request, res: Response): Promise<void> => {
    try {
      const { domain, methods } = req.body as { domain?: string; methods?: ("ct" | "dns" | "bruteforce")[] }

      if (!domain) {
        res.status(400).json({ error: "domain is required (e.g. 'example.com')" })
        return
      }

      let cleanDomain: string
      try {
        cleanDomain = cleanDomainInput(domain)
      } catch {
        res.status(400).json({ error: "Invalid domain" })
        return
      }

      const activeMethods = methods ?? ["ct", "dns", "bruteforce"]
      const startMs = Date.now()
      console.log(
        `[${new Date().toISOString()}] discover-subdomains ${cleanDomain} (methods: ${activeMethods.join(",")})`,
      )

      const allSubdomains = new Map<string, SubdomainResult>()

      if (activeMethods.includes("ct")) {
        const ctResults = await queryCertTransparency(cleanDomain)
        for (const sub of ctResults) {
          allSubdomains.set(sub, { subdomain: sub, source: "ct" })
        }
      }

      if (activeMethods.includes("dns")) {
        const dnsResults = await extractDnsSubdomains(cleanDomain)
        for (const sub of dnsResults) {
          if (!allSubdomains.has(sub)) {
            allSubdomains.set(sub, { subdomain: sub, source: "dns" })
          }
        }
      }

      if (activeMethods.includes("bruteforce")) {
        const BRUTE_CONCURRENCY = 20
        for (let i = 0; i < COMMON_SUBDOMAINS.length; i += BRUTE_CONCURRENCY) {
          const chunk = COMMON_SUBDOMAINS.slice(i, i + BRUTE_CONCURRENCY)
          const results = await Promise.allSettled(
            chunk.map(async prefix => {
              const fqdn = `${prefix}.${cleanDomain}`
              const ips = await resolveSubdomain(fqdn)
              return { fqdn, ips }
            }),
          )
          for (const r of results) {
            if (r.status === "fulfilled" && r.value.ips) {
              const { fqdn, ips } = r.value
              const existing = allSubdomains.get(fqdn)
              if (existing) {
                existing.ip = ips
              } else {
                allSubdomains.set(fqdn, { subdomain: fqdn, source: "dns", ip: ips })
              }
            }
          }
        }
      }

      // Resolve IPs for CT-discovered subdomains
      const unresolvedCt = [...allSubdomains.values()].filter(s => s.source === "ct" && !s.ip)
      if (unresolvedCt.length > 0) {
        const RESOLVE_CONCURRENCY = 20
        for (let i = 0; i < unresolvedCt.length; i += RESOLVE_CONCURRENCY) {
          const chunk = unresolvedCt.slice(i, i + RESOLVE_CONCURRENCY)
          const results = await Promise.allSettled(
            chunk.map(async entry => {
              const ips = await resolveSubdomain(entry.subdomain)
              return { subdomain: entry.subdomain, ips }
            }),
          )
          for (const r of results) {
            if (r.status === "fulfilled" && r.value.ips) {
              const entry = allSubdomains.get(r.value.subdomain)
              if (entry) entry.ip = r.value.ips
            }
          }
        }
      }

      const sorted = [...allSubdomains.values()].sort((a, b) => a.subdomain.localeCompare(b.subdomain))
      const alive = sorted.filter(s => s.ip && s.ip.length > 0)
      const durationMs = Date.now() - startMs

      res.json({
        success: true,
        domain: cleanDomain,
        total: sorted.length,
        alive: alive.length,
        subdomains: sorted,
        methods: activeMethods,
        durationMs,
      })
    } catch (error) {
      console.error(`[${new Date().toISOString()}] discover-subdomains error:`, error)
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      })
    }
  })

  // DNS records
  router.post("/dns-records", async (req: Request, res: Response): Promise<void> => {
    try {
      const { domain } = req.body as { domain?: string }
      if (!domain) {
        res.status(400).json({ error: "domain is required" })
        return
      }

      const cleanDomain = cleanDomainInput(domain)
      const startMs = Date.now()
      console.log(`[${new Date().toISOString()}] dns-records ${cleanDomain}`)

      const records = await resolveAllDns(cleanDomain)
      const durationMs = Date.now() - startMs

      res.json({ success: true, domain: cleanDomain, records, durationMs })
    } catch (error) {
      console.error(`[${new Date().toISOString()}] dns-records error:`, error)
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Unknown error" })
    }
  })

  // WHOIS
  router.post("/whois", async (req: Request, res: Response): Promise<void> => {
    try {
      const { domain } = req.body as { domain?: string }
      if (!domain) {
        res.status(400).json({ error: "domain is required" })
        return
      }

      const cleanDomain = cleanDomainInput(domain)
      const startMs = Date.now()
      console.log(`[${new Date().toISOString()}] whois ${cleanDomain}`)

      const rdapServer = await getRdapServer(cleanDomain)
      if (!rdapServer) {
        res.status(404).json({ success: false, error: `No RDAP server found for TLD of ${cleanDomain}` })
        return
      }

      const rdapUrl = `${rdapServer}/domain/${cleanDomain}`
      const resp = await fetch(rdapUrl, {
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: "application/rdap+json" },
      })

      if (!resp.ok) {
        res.status(resp.status).json({
          success: false,
          error: `RDAP returned ${resp.status}: ${resp.statusText}`,
          rdapUrl,
        })
        return
      }

      const rdapData = (await resp.json()) as Record<string, unknown>
      const whois = extractWhoisFromRdap(rdapData)
      const durationMs = Date.now() - startMs

      res.json({ success: true, ...whois, rdapUrl, durationMs })
    } catch (error) {
      console.error(`[${new Date().toISOString()}] whois error:`, error)
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Unknown error" })
    }
  })

  // Port scan
  router.get("/port-scan/ports", (_req: Request, res: Response) => {
    const ports = Object.entries(DEFAULT_PORTS).map(([port, service]) => ({ port: Number(port), service }))
    res.json({ count: ports.length, ports })
  })

  router.post("/port-scan", async (req: Request, res: Response): Promise<void> => {
    try {
      const { host, ports: customPorts } = req.body as { host?: string; ports?: number[] }
      if (!host) {
        res.status(400).json({ error: "host is required (IP or domain)" })
        return
      }

      let cleanHost: string
      try {
        cleanHost = host.includes("://") ? new URL(host).hostname : host.replace(/\/.*$/, "").replace(/:.*$/, "")
      } catch {
        res.status(400).json({ error: "Invalid host" })
        return
      }

      const portsToScan = customPorts ?? Object.keys(DEFAULT_PORTS).map(Number)

      if (portsToScan.length > 100) {
        res.status(400).json({ error: "Maximum 100 ports per scan" })
        return
      }

      const startMs = Date.now()
      console.log(`[${new Date().toISOString()}] port-scan ${cleanHost} (${portsToScan.length} ports)`)

      let ip: string
      try {
        const ips = await resolve4(cleanHost)
        ip = ips[0] ?? cleanHost
      } catch {
        ip = cleanHost
      }

      const results: Array<{ port: number; service: string; open: boolean; banner?: string }> = []

      for (let i = 0; i < portsToScan.length; i += PORT_SCAN_CONCURRENCY) {
        const chunk = portsToScan.slice(i, i + PORT_SCAN_CONCURRENCY)
        const settled = await Promise.allSettled(chunk.map(port => tcpProbe(ip, port, PORT_SCAN_TIMEOUT_MS)))
        for (const r of settled) {
          if (r.status === "fulfilled") {
            const service = DEFAULT_PORTS[r.value.port] ?? "unknown"
            results.push({ port: r.value.port, service, open: r.value.open, banner: r.value.banner })
          }
        }
      }

      results.sort((a, b) => a.port - b.port)
      const openPorts = results.filter(r => r.open)
      const durationMs = Date.now() - startMs

      res.json({
        success: true,
        host: cleanHost,
        ip,
        scanned: results.length,
        open: openPorts.length,
        ports: openPorts,
        allPorts: results,
        durationMs,
      })
    } catch (error) {
      console.error(`[${new Date().toISOString()}] port-scan error:`, error)
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Unknown error" })
    }
  })
}
