/**
 * Generate Caddy routing configuration from database
 *
 * Reads server identity from /var/lib/claude-bridge/server-config.json
 * Queries database for domains assigned to this server
 * Generates Caddyfile.sites and Caddyfile.shell
 *
 * Usage: bun run routing:generate
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"

// =============================================================================
// Types
// =============================================================================

interface ServerConfig {
  serverId: string
  paths: {
    bridgeRoot: string
    sitesRoot: string
    imagesStorage: string
  }
  domains: {
    cookieDomain: string
    previewBase: string
    frameAncestors: string[]
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

interface DomainRow {
  hostname: string
  port: number
}

// =============================================================================
// Helpers
// =============================================================================

const SERVER_CONFIG_PATH = "/var/lib/claude-bridge/server-config.json"

function must<T>(v: T | undefined | null, msg: string): T {
  if (v === undefined || v === null) throw new Error(msg)
  return v
}

function sanitizeLabel(domain: string): string {
  return domain.replace(/\./g, "-")
}

async function loadServerConfig(): Promise<ServerConfig> {
  const raw = await readFile(SERVER_CONFIG_PATH, "utf8")
  const cfg = JSON.parse(raw) as ServerConfig
  must(cfg.serverId, "server-config.json missing serverId")
  must(cfg.generated?.dir, "server-config.json missing generated.dir")
  return cfg
}

async function loadSnippet(bridgeRoot: string, rel: string): Promise<string> {
  const p = path.join(bridgeRoot, rel)
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
    "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY is required"
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
  _snippets: { common: string; image: string },
  domains: DomainRow[]
): string {
  const header = [
    "# GENERATED FILE - DO NOT EDIT",
    `# serverId: ${cfg.serverId}`,
    `# generated: ${new Date().toISOString()}`,
    `# domains: ${domains.length}`,
    "",
    "# NOTE: Snippets (common_headers, image_serving) are imported globally",
    "# from /etc/caddy/snippets/ via the main Caddyfile",
    "",
  ].join("\n")

  // Skip snippet definitions - they're already loaded globally from /etc/caddy/snippets/
  // Just generate site blocks that use `import <snippet_name>`

  // Generate site blocks
  const frameAncestors = cfg.domains.frameAncestors.join(" ")

  const siteBlocks = domains
    .map(({ hostname, port }) => {
      const previewLabel = sanitizeLabel(hostname)
      const previewDomain = `${previewLabel}.${cfg.domains.previewBase}`

      // Main domain block
      const mainBlock = [
        `${hostname} {`,
        "    import common_headers",
        "    import image_serving",
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

      // Preview subdomain block (embeddable)
      const previewBlock = [
        `${previewDomain} {`,
        "    import image_serving",
        "",
        `    reverse_proxy localhost:${port} {`,
        "        header_up Host localhost",
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
      ].join("\n")

      return `${mainBlock}\n\n${previewBlock}`
    })
    .join("\n\n")

  return `${header}${siteBlocks}\n`
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
    .map((d) => {
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
  const header = [
    "# GENERATED FILE - DO NOT EDIT",
    `# serverId: ${cfg.serverId}`,
    "",
  ].join("\n")

  if (!cfg.shell?.domains?.length) {
    return `${header}map $ssl_preread_server_name $backend {\n    default caddy_main;\n}\n`
  }

  const lines = [
    "map $ssl_preread_server_name $backend {",
    ...cfg.shell.domains.map((d) => `    ${d}   caddy_shell;`),
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
  console.log(`  bridgeRoot: ${cfg.paths.bridgeRoot}`)

  console.log("\nLoading snippets...")
  const [commonHeaders, imageServing] = await Promise.all([
    loadSnippet(cfg.paths.bridgeRoot, "ops/caddy/snippets/common_headers.caddy"),
    loadSnippet(cfg.paths.bridgeRoot, "ops/caddy/snippets/image_serving.caddy"),
  ])
  console.log("  Loaded common_headers.caddy")
  console.log("  Loaded image_serving.caddy")

  console.log("\nQuerying database for domains...")
  const domains = await queryDomains(cfg.serverId)
  console.log(`  Found ${domains.length} domains for this server`)

  console.log("\nGenerating files...")

  // Ensure output directory exists
  await mkdir(cfg.generated.dir, { recursive: true })

  // Generate Caddyfile.sites
  const sites = renderCaddySites(cfg, { common: commonHeaders, image: imageServing }, domains)
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

run().catch((e) => {
  const msg = e.message || String(e)

  console.error("\n\x1b[31m╔══════════════════════════════════════════════════════════════╗\x1b[0m")
  console.error("\x1b[31m║                    Generation Failed                         ║\x1b[0m")
  console.error("\x1b[31m╚══════════════════════════════════════════════════════════════╝\x1b[0m")
  console.error(`\n\x1b[31mError:\x1b[0m ${msg}\n`)

  // Provide specific help based on error
  if (msg.includes("server-config.json") || msg.includes("ENOENT")) {
    console.error("\x1b[33mFix:\x1b[0m Create /var/lib/claude-bridge/server-config.json")
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
  }

  console.error("Run \x1b[36mbun run --cwd packages/site-controller setup:validate\x1b[0m for full diagnostics.\n")
  process.exit(1)
})
