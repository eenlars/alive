#!/usr/bin/env bun
/**
 * Generate preview subdomain Caddyfile blocks from existing domain→port mappings
 *
 * This script:
 * 1. Parses the main Caddyfile to extract domain→port mappings
 * 2. Generates corresponding preview subdomain blocks for EACH environment
 * 3. Outputs Caddyfile snippet to stdout (append manually or via script)
 *
 * Each environment gets its own preview subdomain:
 *   - production: protino-sonno-tech.preview.sonno.tech → auth:9000
 *   - staging: protino-sonno-tech.preview.staging.sonno.tech → auth:8998
 *   - dev: protino-sonno-tech.preview.dev.sonno.tech → auth:8997
 */

import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { DOMAINS } from "@webalive/shared"

// Get script directory and repo root
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, "../..")

// Configurable paths via environment variables with repo-relative defaults
const CADDYFILE_PATH = process.env.CADDYFILE_PATH || resolve(REPO_ROOT, "ops/caddy/Caddyfile")
const ENV_CONFIG_PATH = process.env.ENV_CONFIG_PATH || resolve(REPO_ROOT, "packages/shared/environments.json")

// Validate and read environments.json
if (!existsSync(ENV_CONFIG_PATH)) {
  console.error(`Error: environments.json not found at ${ENV_CONFIG_PATH}`)
  console.error("Set ENV_CONFIG_PATH environment variable or ensure file exists at default location")
  process.exit(1)
}

interface EnvironmentConfig {
  key: string
  port: number
  domain: string
  previewBase: string
}

interface DomainMapping {
  domain: string
  port: number
}

const envConfigRaw = JSON.parse(readFileSync(ENV_CONFIG_PATH, "utf-8"))
const environments: EnvironmentConfig[] = Object.values(envConfigRaw.environments || {}).filter(
  (env: unknown): env is EnvironmentConfig => {
    const e = env as Record<string, unknown>
    return typeof e.port === "number" && typeof e.previewBase === "string" && typeof e.domain === "string"
  }
)

if (environments.length === 0) {
  console.error(`Error: No valid environments found in ${ENV_CONFIG_PATH}`)
  console.error("Each environment needs: port (number), domain (string), previewBase (string)")
  process.exit(1)
}

// Build frame-ancestors from all environment domains (+ production URL)
const frameAncestors = environments.map((e) => `https://${e.domain}`).join(" ") + ` ${DOMAINS.STREAM_PROD}`

/**
 * Parse Caddyfile to extract domain→port mappings
 */
function parseCaddyfile(content: string): DomainMapping[] {
  const mappings: DomainMapping[] = []

  // Regex to match domain blocks with reverse_proxy directives
  // Handles both single domains and comma-separated domains
  const domainBlockRegex = /^([a-zA-Z0-9.-]+(?:,\s*[a-zA-Z0-9.-]+)*)\s*\{[\s\S]*?reverse_proxy\s+localhost:(\d+)/gm

  // Get all environment domains to skip
  const envDomains = environments.flatMap((e) => [e.domain, e.previewBase])

  for (const match of content.matchAll(domainBlockRegex)) {
    const domains = match[1].split(",").map((d) => d.trim())
    const port = parseInt(match[2], 10)

    for (const domain of domains) {
      // Skip Claude Bridge itself and preview domains
      // Use exact match or subdomain check (not substring) to avoid false positives
      const isEnvDomain = envDomains.some((ed) => domain === ed || domain.endsWith(`.${ed}`))
      if (isEnvDomain) {
        continue
      }

      mappings.push({ domain, port })
    }
  }

  return mappings
}

/**
 * Convert domain to preview subdomain label
 * Examples:
 *   protino.sonno.tech → protino-sonno-tech
 *   demo.sonno.tech → demo-sonno-tech
 *
 * Note: Matches domainToPreviewLabel() in apps/web/lib/preview-utils.ts
 */
function domainToLabel(domain: string): string {
  return domain.replace(/\./g, "-")
}

/**
 * Generate preview subdomain block for a workspace + environment
 */
function generatePreviewBlock(mapping: DomainMapping, env: EnvironmentConfig): string {
  const label = domainToLabel(mapping.domain)
  const previewHost = `${label}.${env.previewBase}`

  return `
${previewHost} {
    import image_serving

    reverse_proxy localhost:${mapping.port} {
        header_up Host localhost
    }

    header {
        # Security headers (embeddable variant)
        -X-Frame-Options
        Content-Security-Policy "frame-ancestors ${frameAncestors}"
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
        -Server
        -X-Powered-By
    }

    # SECURITY: Strip any client-supplied X-Preview-Set-Cookie header to prevent cookie injection
    request_header -X-Preview-Set-Cookie

    # Auth check via forward_auth (routes to ${env.key} environment)
    forward_auth localhost:${env.port} {
        uri /api/auth/preview-guard?{query}
        copy_headers Cookie X-Preview-Set-Cookie
    }

    # Map X-Preview-Set-Cookie from forward_auth to Set-Cookie response header
    @has_preview_cookie header X-Preview-Set-Cookie *
    header @has_preview_cookie +Set-Cookie "{http.request.header.X-Preview-Set-Cookie}"
}
`.trimStart()
}

/**
 * Generate complete preview section for Caddyfile
 */
function generatePreviewSection(mappings: DomainMapping[]): string {
  const envInfo = environments.map((e) => `#   - ${e.key}: *.${e.previewBase} → localhost:${e.port}`).join("\n")

  // Generate blocks for each environment
  const allBlocks: string[] = []

  for (const env of environments) {
    const envHeader = `
# ----------------------------------------------------------------------------
# ${env.key.toUpperCase()} PREVIEW DOMAINS (*.${env.previewBase})
# Auth routes to localhost:${env.port}
# ----------------------------------------------------------------------------
`
    const blocks = mappings.map((m) => generatePreviewBlock(m, env)).join("\n")
    allBlocks.push(envHeader + blocks)
  }

  return `
# ============================================================================
# PREVIEW SUBDOMAINS (AUTO-GENERATED)
# ============================================================================
# This section is auto-generated by scripts/database/generate-preview-caddyfile.ts
# DO NOT EDIT MANUALLY - Changes will be overwritten
#
# Preview subdomains allow iframe embedding of workspace dev servers
# with proper authentication and security headers.
#
# Each environment has its own preview subdomain base:
${envInfo}
#
# Features:
# - Host header set to "localhost" for Vite dev server compatibility
# - X-Frame-Options removed to allow iframe embedding
# - CSP frame-ancestors restricts to environment domains
# - forward_auth enforces session authentication at Caddy edge
# - Cookie propagation via X-Preview-Set-Cookie header mapping
# ============================================================================

${allBlocks.join("\n")}
# ============================================================================
# END PREVIEW SUBDOMAINS (AUTO-GENERATED)
# ============================================================================
`.trimStart()
}

/**
 * Main execution
 */
function main() {
  // Show resolved paths for debugging
  console.error("Configuration:")
  console.error(`  Caddyfile: ${CADDYFILE_PATH}`)
  console.error(`  Environments: ${ENV_CONFIG_PATH}`)
  console.error(`  Environments found: ${environments.length}`)
  for (const env of environments) {
    console.error(`    - ${env.key}: ${env.previewBase} → localhost:${env.port}`)
  }
  console.error("")

  // Check if Caddyfile exists
  if (!existsSync(CADDYFILE_PATH)) {
    console.error(`Error: Caddyfile not found at ${CADDYFILE_PATH}`)
    console.error("Set CADDYFILE_PATH environment variable or ensure file exists at default location")
    process.exit(1)
  }

  // Read and parse Caddyfile
  const content = readFileSync(CADDYFILE_PATH, "utf-8")
  const mappings = parseCaddyfile(content)

  if (mappings.length === 0) {
    console.error("Error: No domain→port mappings found in Caddyfile")
    process.exit(1)
  }

  console.error(`Found ${mappings.length} workspace domains`)
  console.error(`Will generate ${mappings.length * environments.length} preview blocks total`)

  // Generate preview section
  const previewSection = generatePreviewSection(mappings)

  // Output to stdout (can be piped or redirected)
  console.log(previewSection)

  console.error("\n✓ Preview Caddyfile blocks generated successfully")
  console.error("To append to Caddyfile, run:")
  console.error(`  bun run ${__filename} >> ${CADDYFILE_PATH}`)
  console.error("Then reload Caddy:")
  console.error("  systemctl reload caddy")
}

main()
