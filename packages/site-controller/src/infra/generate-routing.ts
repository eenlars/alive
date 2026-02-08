/**
 * Generate Caddy routing configuration from database
 *
 * Reads server identity from server-config.json (via SERVER_CONFIG_PATH env var)
 * Queries database for domains assigned to this server
 * Generates Caddyfile.sites and Caddyfile.shell
 *
 * Preview domains are generated for EACH environment (production, staging, dev)
 * with auth routing to the respective environment's port.
 *
 * Usage: bun run routing:generate
 */

import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"
import { DOMAINS, requireEnv } from "@webalive/shared"

// =============================================================================
// Types
// =============================================================================

interface ServerConfig {
  serverId: string
  paths: {
    aliveRoot: string
    sitesRoot: string
    imagesStorage: string
  }
  domains: {
    main: string // Base domain - all env domains derived from this
    cookieDomain: string
    previewBase?: string // e.g., "sonno.tech" — the wildcard domain for preview subdomains
  }
  shell: {
    domains: string[]
    listen: string
    upstream: string
  }
  generated: {
    dir: string
    caddySites: string
    caddyShell: string
    nginxMap: string
  }
}

interface EnvironmentConfigRaw {
  key: string
  subdomain: string
  port: number
}

interface EnvironmentConfig {
  key: string
  port: number
  domain: string
  previewBase: string
}

interface DomainRow {
  hostname: string
  port: number
}

// =============================================================================
// Helpers
// =============================================================================

const SERVER_CONFIG_PATH = requireEnv("SERVER_CONFIG_PATH")

function must<T>(v: T | undefined | null, msg: string): T {
  if (v === undefined || v === null) throw new Error(msg)
  return v
}

function filterReservedDomains(domains: DomainRow[], environments: EnvironmentConfig[]): DomainRow[] {
  const reservedDomains = new Set(environments.flatMap(e => [e.domain, e.previewBase]))

  return domains.filter(d => {
    if (reservedDomains.has(d.hostname)) return false
    return !environments.some(e => d.hostname.endsWith(`.${e.previewBase}`))
  })
}

async function loadServerConfig(): Promise<ServerConfig> {
  const raw = await readFile(SERVER_CONFIG_PATH, "utf8")
  const cfg = JSON.parse(raw) as ServerConfig
  must(cfg.serverId, "server-config.json missing serverId")
  must(cfg.domains?.main, "server-config.json missing domains.main")
  must(cfg.generated?.dir, "server-config.json missing generated.dir")
  return cfg
}

async function loadEnvironments(aliveRoot: string, mainDomain: string): Promise<EnvironmentConfig[]> {
  const envPath = path.join(aliveRoot, "packages/shared/environments.json")
  const raw = await readFile(envPath, "utf8")
  const envConfigRaw = JSON.parse(raw)

  const rawEnvs: EnvironmentConfigRaw[] = Object.values(envConfigRaw.environments || {}).filter(
    (env: unknown): env is EnvironmentConfigRaw => {
      const e = env as Record<string, unknown>
      return typeof e.key === "string" && typeof e.port === "number" && typeof e.subdomain === "string"
    },
  )

  if (rawEnvs.length === 0) {
    throw new Error(`No valid environments found in ${envPath}. Each needs: key, port, subdomain`)
  }

  // Derive full domains from mainDomain
  // Pattern: {subdomain}.{mainDomain} (e.g., app.sonno.tech, staging.sonno.tech)
  // PreviewBase: preview.{subdomain}.{mainDomain} (e.g., preview.app.sonno.tech)
  return rawEnvs.map(env => ({
    key: env.key,
    port: env.port,
    domain: `${env.subdomain}.${mainDomain}`,
    previewBase: `preview.${env.subdomain}.${mainDomain}`,
  }))
}

async function loadSnippet(aliveRoot: string, rel: string): Promise<string> {
  const p = path.join(aliveRoot, rel)
  return readFile(p, "utf8")
}

async function atomicWrite(filePath: string, content: string) {
  const dir = path.dirname(filePath)
  if (!existsSync(dir)) await mkdir(dir, { recursive: true })
  const tmp = `${filePath}.tmp.${process.pid}`
  await writeFile(tmp, content, "utf8")
  // Rename for atomicity (works on most filesystems)
  const { rename } = await import("node:fs/promises")
  await rename(tmp, filePath)
}

// =============================================================================
// Database Query
// =============================================================================

async function queryDomains(serverId: string): Promise<DomainRow[]> {
  const url = must(process.env.SUPABASE_URL, "SUPABASE_URL is required")
  const key = must(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
    "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY is required",
  )

  const supabase = createClient(url, key, {
    db: { schema: "app" },
  })

  // Query domains assigned to this server
  // The user said they added server_id column via migration
  const { data, error } = await supabase
    .from("domains")
    .select("hostname, port")
    .eq("server_id", serverId)
    .is("is_test_env", false)
    .order("hostname", { ascending: true })

  if (error) {
    throw new Error(`Failed to query domains: ${error.message}`)
  }

  return (data || []) as DomainRow[]
}

// =============================================================================
// Renderers
// =============================================================================

function renderCaddySites(
  cfg: ServerConfig,
  environments: EnvironmentConfig[],
  _snippets: { common: string; image: string },
  domains: DomainRow[],
): string {
  const filteredDomains = filterReservedDomains(domains, environments)
  const previewBase = cfg.domains.previewBase

  const header = [
    "# GENERATED FILE - DO NOT EDIT",
    `# serverId: ${cfg.serverId}`,
    `# generated: ${new Date().toISOString()}`,
    `# domains: ${filteredDomains.length}`,
    `# environments: ${environments.map(e => e.key).join(", ")}`,
    `# previewBase: ${previewBase || "(not configured)"}`,
    "",
    "# NOTE: Snippets (common_headers, image_serving) are imported globally",
    "# by the main Caddyfile (see ops/caddy/Caddyfile.snippets)",
    "",
  ].join("\n")

  // Build frame-ancestors from all environment domains (+ production URL)
  const frameAncestors = `${environments.map(e => `https://${e.domain}`).join(" ")} ${DOMAINS.STREAM_PROD}`

  // Generate site blocks (main domain only — preview is handled by wildcard below)
  const siteBlocks = filteredDomains
    .map(({ hostname, port }) => {
      return [
        `${hostname} {`,
        "    import common_headers",
        "    import image_serving",
        "",
        "    # Serve user work files directly from disk",
        "    handle_path /files/* {",
        `        root * ${cfg.paths.sitesRoot}/${hostname}/user/.alive/files`,
        '        header Cache-Control "no-cache"',
        "        file_server",
        "    }",
        "",
        "    header {",
        "        -X-Frame-Options",
        "        X-Content-Type-Options nosniff",
        '        X-XSS-Protection "1; mode=block"',
        "        Referrer-Policy strict-origin-when-cross-origin",
        "        -Server",
        "        -X-Powered-By",
        "    }",
        "",
        `    reverse_proxy localhost:${port} {`,
        "        header_up Host {host}",
        "        header_up X-Real-IP {remote_host}",
        "        header_up X-Forwarded-For {remote_host}",
        "        header_up X-Forwarded-Proto {scheme}",
        "    }",
        "}",
      ].join("\n")
    })
    .join("\n\n")

  // Generate wildcard catch-all for preview subdomains (preview--{label}.{WILDCARD})
  // Single-level pattern: covered by Cloudflare Universal SSL *.{WILDCARD}
  // Routes through Next.js middleware → preview-router for auth + port lookup
  const prodEnv = environments.find(e => e.key === "production")
  const wildcardBlock = prodEnv ? renderWildcardPreviewBlock(cfg.domains.main, prodEnv.port, frameAncestors) : ""

  return `${header}${siteBlocks}\n\n${wildcardBlock}`
}

/**
 * Generate a wildcard catch-all block for the domain.
 *
 * Catches preview subdomains (preview--{label}.{WILDCARD}) and routes to Next.js.
 * Next.js middleware detects the preview-- prefix and rewrites to /api/preview-router.
 * Specific domain blocks take precedence over this wildcard (Caddy routes by specificity).
 *
 * Uses single-level subdomain pattern (preview--{label}.{WILDCARD}) so that
 * Cloudflare Universal SSL covers them (it only supports one-level wildcards).
 *
 * On-demand TLS: individual LE certs per subdomain as they're accessed.
 */
function renderWildcardPreviewBlock(wildcardDomain: string, appPort: number, frameAncestors: string): string {
  return [
    "# ============================================================================",
    `# WILDCARD CATCH-ALL (*.${wildcardDomain})`,
    "# Catches preview subdomains (preview--{label}." + wildcardDomain + ") and routes to",
    "# Next.js. Middleware detects preview-- prefix and rewrites to /api/preview-router.",
    "# Specific domain blocks above take precedence (Caddy routes by specificity).",
    "# On-demand TLS: individual LE certs per subdomain as they're accessed.",
    "# ============================================================================",
    "",
    `*.${wildcardDomain} {`,
    "    tls {",
    "        on_demand",
    "    }",
    "",
    `    reverse_proxy localhost:${appPort} {`,
    "        header_up X-Forwarded-Host {http.request.host}",
    "        header_up X-Real-IP {remote_host}",
    "        header_up X-Forwarded-Proto https",
    "    }",
    "",
    "    header {",
    "        -X-Frame-Options",
    `        Content-Security-Policy "frame-ancestors ${frameAncestors}"`,
    "        X-Content-Type-Options nosniff",
    "        Referrer-Policy strict-origin-when-cross-origin",
    "        -Server",
    "        -X-Powered-By",
    "    }",
    "}",
    "",
  ].join("\n")
}

function renderCaddyShell(cfg: ServerConfig): string {
  const header = [
    "# GENERATED FILE - DO NOT EDIT",
    `# serverId: ${cfg.serverId}`,
    `# generated: ${new Date().toISOString()}`,
    "",
  ].join("\n")

  if (!cfg.shell?.domains?.length) {
    return `${header}# No shell domains configured\n`
  }

  const blocks = cfg.shell.domains
    .map(d => {
      return [
        `${d}${cfg.shell.listen} {`,
        `    reverse_proxy ${cfg.shell.upstream} {`,
        "        stream_close_delay 5m",
        "    }",
        "}",
      ].join("\n")
    })
    .join("\n\n")

  return `${header}\n${blocks}\n`
}

function renderNginxSniMap(cfg: ServerConfig): string {
  const header = ["# GENERATED FILE - DO NOT EDIT", `# serverId: ${cfg.serverId}`, ""].join("\n")

  if (!cfg.shell?.domains?.length) {
    return `${header}map $ssl_preread_server_name $backend {\n    default caddy_main;\n}\n`
  }

  const lines = [
    "map $ssl_preread_server_name $backend {",
    ...cfg.shell.domains.map(d => `    ${d}   caddy_shell;`),
    "    default   caddy_main;",
    "}",
    "",
  ]

  return `${header}${lines.join("\n")}`
}

// =============================================================================
// Main
// =============================================================================

async function run() {
  console.log("Loading server config...")
  const cfg = await loadServerConfig()
  console.log(`  serverId: ${cfg.serverId}`)
  console.log(`  aliveRoot: ${cfg.paths.aliveRoot}`)
  console.log(`  mainDomain: ${cfg.domains.main}`)
  console.log(`  previewBase: ${cfg.domains.previewBase || "(not configured)"}`)

  console.log("\nLoading environments (domains derived from server config)...")
  const environments = await loadEnvironments(cfg.paths.aliveRoot, cfg.domains.main)
  for (const env of environments) {
    console.log(`  - ${env.key}: ${env.domain} (preview: ${env.previewBase}) → localhost:${env.port}`)
  }

  console.log("\nLoading snippets...")
  const [commonHeaders, imageServing] = await Promise.all([
    loadSnippet(cfg.paths.aliveRoot, "ops/caddy/snippets/common_headers.caddy"),
    loadSnippet(cfg.paths.aliveRoot, "ops/caddy/snippets/image_serving.caddy"),
  ])
  console.log("  Loaded common_headers.caddy")
  console.log("  Loaded image_serving.caddy")

  console.log("\nQuerying database for domains...")
  const domains = await queryDomains(cfg.serverId)
  const filteredDomains = filterReservedDomains(domains, environments)
  console.log(`  Found ${domains.length} domains for this server`)
  console.log(`  Will generate ${filteredDomains.length + (cfg.domains.previewBase ? 1 : 0)} blocks total`)
  console.log(`    - ${filteredDomains.length} main domain blocks`)
  if (cfg.domains.previewBase) {
    console.log(`    - 1 wildcard preview block (*.${cfg.domains.previewBase})`)
  } else {
    console.log("    - 0 preview blocks (previewBase not configured)")
  }

  console.log("\nGenerating files...")

  // Ensure output directory exists
  await mkdir(cfg.generated.dir, { recursive: true })

  // Generate Caddyfile.sites
  const sites = renderCaddySites(cfg, environments, { common: commonHeaders, image: imageServing }, domains)
  await atomicWrite(cfg.generated.caddySites, sites)
  console.log(`  ${cfg.generated.caddySites}`)

  // Generate Caddyfile.shell
  const shell = renderCaddyShell(cfg)
  await atomicWrite(cfg.generated.caddyShell, shell)
  console.log(`  ${cfg.generated.caddyShell}`)

  // Generate nginx SNI map
  const nginxMap = renderNginxSniMap(cfg)
  await atomicWrite(cfg.generated.nginxMap, nginxMap)
  console.log(`  ${cfg.generated.nginxMap}`)

  console.log("\nDone!")
  console.log("\nNext steps:")
  console.log("  1. Validate: caddy validate --config /etc/caddy/Caddyfile")
  console.log("  2. Reload:   systemctl reload caddy")
  console.log("  3. Reload:   systemctl reload caddy-shell")
}

run().catch(e => {
  const msg = e.message || String(e)

  console.error("\n\x1b[31m╔══════════════════════════════════════════════════════════════╗\x1b[0m")
  console.error("\x1b[31m║                    Generation Failed                         ║\x1b[0m")
  console.error("\x1b[31m╚══════════════════════════════════════════════════════════════╝\x1b[0m")
  console.error(`\n\x1b[31mError:\x1b[0m ${msg}\n`)

  // Provide specific help based on error
  if (msg.includes("SERVER_CONFIG_PATH")) {
    console.error("\x1b[33mFix:\x1b[0m Set SERVER_CONFIG_PATH env var to point to server-config.json")
    console.error("     Example: export SERVER_CONFIG_PATH=/var/lib/claude-bridge/server-config.json")
    console.error("     Copy from: ops/server-config.example.json\n")
  } else if (msg.includes("server-config.json") || msg.includes("ENOENT")) {
    console.error("\x1b[33mFix:\x1b[0m Ensure server-config.json exists at the SERVER_CONFIG_PATH location")
    console.error("     Copy from: ops/server-config.example.json")
    console.error("     Then edit with this server's configuration\n")
  } else if (msg.includes("SUPABASE_URL")) {
    console.error("\x1b[33mFix:\x1b[0m Set database credentials:")
    console.error("     export SUPABASE_URL=https://xxx.supabase.co")
    console.error("     export SUPABASE_SERVICE_ROLE_KEY=eyJ...\n")
  } else if (msg.includes("server_id")) {
    console.error("\x1b[33mFix:\x1b[0m Add server_id column to domains table:")
    console.error("     ALTER TABLE app.domains ADD COLUMN server_id TEXT;\n")
  } else if (msg.includes("snippets") || msg.includes("common_headers") || msg.includes("image_serving")) {
    console.error("\x1b[33mFix:\x1b[0m Ensure Caddy snippets exist in ops/caddy/snippets/")
    console.error("     Required: common_headers.caddy, image_serving.caddy\n")
  } else if (msg.includes("environments")) {
    console.error("\x1b[33mFix:\x1b[0m Ensure packages/shared/environments.json exists")
    console.error("     Each environment needs: key, port, subdomain\n")
  } else if (msg.includes("domains.main")) {
    console.error("\x1b[33mFix:\x1b[0m Add domains.main to server-config.json")
    console.error('     Example: "domains": { "main": "sonno.tech" }\n')
  }

  console.error("Run \x1b[36mbun run --cwd packages/site-controller setup:validate\x1b[0m for full diagnostics.\n")
  process.exit(1)
})
