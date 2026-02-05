#!/usr/bin/env bun
/**
 * Golden Path Site Deployment Script
 *
 * Usage:
 *   bun run deploy-site <domain>              # Deploy to sonno.tech subdomain
 *   bun run deploy-site mydomain.com          # Deploy custom domain
 *   bun run deploy-site --help                # Show help
 *
 * Environment:
 *   Uses .env.production by default. Set ENV=staging or ENV=development to use other env files.
 */

import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, "..")
const WEB_APP = resolve(PROJECT_ROOT, "apps/web")

// Parse arguments
const args = process.argv.slice(2)
const showHelp = args.includes("--help") || args.includes("-h")
const envName = process.env.ENV || "production"
const domainArg = args.find((arg) => !arg.startsWith("-"))

// Show help
if (showHelp || !domainArg) {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                  Site Deployment Script                         ║
╚════════════════════════════════════════════════════════════════╝

Usage:
  bun run deploy-site <domain>           Deploy a site

Examples:
  bun run deploy-site mysite             → mysite.sonno.tech
  bun run deploy-site mysite.sonno.tech  → mysite.sonno.tech
  bun run deploy-site custom.com         → custom.com (requires DNS)

Environment:
  ENV=production (default)  Use .env.production
  ENV=staging               Use .env.staging
  ENV=development           Use .env.development

Options:
  --help, -h                Show this help

Requirements:
  - DATABASE_URL and DATABASE_PASSWORD in env file
  - Server must have server-config.json at /var/lib/alive/
`)
  process.exit(showHelp ? 0 : 1)
}

// Load environment variables from the appropriate .env file
async function loadEnv(envFile: string): Promise<void> {
  if (!existsSync(envFile)) {
    throw new Error(`Environment file not found: ${envFile}`)
  }

  const content = await readFile(envFile, "utf-8")
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    const eqIndex = trimmed.indexOf("=")
    if (eqIndex === -1) continue

    const key = trimmed.slice(0, eqIndex)
    let value = trimmed.slice(eqIndex + 1)

    // Remove surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    // Don't override existing env vars
    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

// Main deployment logic
async function main() {
  const envFile = resolve(WEB_APP, `.env.${envName}`)

  console.log("═══════════════════════════════════════════════════════")
  console.log("              SITE DEPLOYMENT")
  console.log("═══════════════════════════════════════════════════════")
  console.log()
  console.log(`Environment: ${envName} (${envFile})`)

  // Load environment
  try {
    await loadEnv(envFile)
  } catch (error) {
    console.error(`Failed to load environment: ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }

  // Validate required env vars
  if (!process.env.DATABASE_URL) {
    console.error("Missing DATABASE_URL in environment file")
    process.exit(1)
  }
  if (!process.env.DATABASE_PASSWORD) {
    console.error("Missing DATABASE_PASSWORD in environment file")
    process.exit(1)
  }

  // Now import the site controller (after env vars are loaded)
  const { SiteOrchestrator, PATHS, DEFAULTS } = await import("@webalive/site-controller")

  // Determine domain and slug
  // Slug is always the full domain with dots replaced by dashes
  // This matches the systemd template which uses %i for the directory path
  let domain = domainArg

  if (!domain.includes(".")) {
    // Simple subdomain: mysite → mysite.${DEFAULTS.WILDCARD_DOMAIN}
    domain = `${domain}.${DEFAULTS.WILDCARD_DOMAIN}`
  }

  // Slug is domain with dots replaced by dashes (e.g., mysite-alive-best)
  const slug = domain.replace(/\./g, "-")

  console.log(`Domain:      ${domain}`)
  console.log(`Slug:        ${slug}`)
  console.log(`Template:    ${PATHS.TEMPLATE_PATH}`)
  console.log()

  try {
    const result = await SiteOrchestrator.deploy({
      domain,
      slug,
      templatePath: PATHS.TEMPLATE_PATH,
      serverIp: DEFAULTS.SERVER_IP,
      wildcardDomain: DEFAULTS.WILDCARD_DOMAIN,
      rollbackOnFailure: true,
    })

    if (!result.success) {
      throw new Error(result.error || "Deployment failed")
    }

    console.log()
    console.log("═══════════════════════════════════════════════════════")
    console.log("              ✅ DEPLOYMENT SUCCESSFUL!")
    console.log("═══════════════════════════════════════════════════════")
    console.log()
    console.log("Result:")
    console.log(`   Domain:  ${result.domain}`)
    console.log(`   Port:    ${result.port}`)
    console.log(`   Service: ${result.serviceName}`)
    console.log()
    console.log("Verification:")
    console.log(`   systemctl status ${result.serviceName}`)
    console.log(`   curl -I http://localhost:${result.port}`)
    console.log(`   journalctl -u ${result.serviceName} -n 20`)
    console.log()
    console.log(`🌐 https://${domain}`)
    console.log()

    process.exit(0)
  } catch (error) {
    console.error()
    console.error("═══════════════════════════════════════════════════════")
    console.error("              ❌ DEPLOYMENT FAILED!")
    console.error("═══════════════════════════════════════════════════════")
    console.error()
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`)
      if (error.stack) {
        console.error()
        console.error("Stack:")
        console.error(error.stack)
      }
    } else {
      console.error(String(error))
    }
    process.exit(1)
  }
}

main()
