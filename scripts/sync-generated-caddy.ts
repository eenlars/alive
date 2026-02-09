#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { PATHS } from "@webalive/shared"

const SRC = PATHS.CADDYFILE_SITES
const DEST = resolve(PATHS.ALIVE_ROOT, "ops/caddy/generated/Caddyfile.sites")
const ENV_PATH = resolve(PATHS.ALIVE_ROOT, "packages/shared/environments.json")

function sanitizeLabel(domain: string): string {
  return domain.replace(/\./g, "-")
}

const serverConfigPath = process.env.SERVER_CONFIG_PATH || PATHS.SERVER_CONFIG
const serverConfig = JSON.parse(readFileSync(serverConfigPath, "utf-8"))
const mainDomain: string = serverConfig.domains?.main
if (!mainDomain) {
  throw new Error(`Missing domains.main in ${serverConfigPath}`)
}
const previewBase: string = serverConfig.domains?.previewBase
if (!previewBase) {
  throw new Error(`Missing domains.previewBase in ${serverConfigPath}`)
}

const envConfig = JSON.parse(readFileSync(ENV_PATH, "utf-8"))
const environments = Object.values(envConfig.environments || {}) as Array<{
  key: string
  subdomain: string
}>

const reserved = new Set<string>()
const previewForReserved = new Set<string>()

for (const env of environments) {
  const domain = `${env.subdomain}.${mainDomain}`
  reserved.add(domain)
}

// Also exclude preview domains generated for reserved environment domains
for (const envDomain of reserved) {
  if (!envDomain.includes(".")) continue
  const label = sanitizeLabel(envDomain)
  previewForReserved.add(`${label}.${previewBase}`)
}

// Extract domains from existing Caddy configs to avoid conflicts
function extractHostsFromCaddyfile(filePath: string): string[] {
  try {
    const content = readFileSync(filePath, "utf-8")
    const hosts: string[] = []
    for (const line of content.split(/\r?\n/)) {
      const m = line.trim().match(/^([^#{(][^{]*)\{/)
      if (m) {
        for (const h of m[1].split(",")) {
          const host = h.trim()
          if (host) hosts.push(host)
        }
      }
    }
    return hosts
  } catch {
    return []
  }
}

const existingHosts = [
  ...extractHostsFromCaddyfile("/etc/caddy/Caddyfile.prod"),
  ...extractHostsFromCaddyfile("/etc/caddy/Caddyfile.staging"),
  ...extractHostsFromCaddyfile("/etc/caddy/Caddyfile"),
]

const blocked = new Set([...reserved, ...previewForReserved, ...existingHosts])

const lines = readFileSync(SRC, "utf-8").split(/\r?\n/)
const blocks: string[] = []

let i = 0
while (i < lines.length) {
  const line = lines[i]
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith("#")) {
    i += 1
    continue
  }
  if (trimmed.startsWith("(")) {
    // Skip any snippet definitions (shouldn't be in generated file)
    let brace = line.split("{").length - line.split("}").length
    i += 1
    while (i < lines.length && brace > 0) {
      brace += lines[i].split("{").length - lines[i].split("}").length
      i += 1
    }
    continue
  }

  const match = /^([*A-Za-z0-9.-]+)\s*\{/.exec(trimmed)
  if (!match) {
    i += 1
    continue
  }

  const host = match[1]
  const blockLines = [line]
  let brace = line.split("{").length - line.split("}").length
  i += 1
  while (i < lines.length && brace > 0) {
    blockLines.push(lines[i])
    brace += lines[i].split("{").length - lines[i].split("}").length
    i += 1
  }

  if (!blocked.has(host)) {
    blocks.push(blockLines.join("\n"))
  }
}

const header = [
  "# GENERATED FILE - DO NOT EDIT",
  `# Source: ${SRC}`,
  `# Filtered: ${new Date().toISOString()}`,
  `# Blocked hosts: ${blocked.size}`,
  "",
].join("\n")

mkdirSync(dirname(DEST), { recursive: true })
writeFileSync(DEST, `${header}${blocks.join("\n\n")}\n`, "utf-8")

console.log("Wrote filtered Caddyfile:")
console.log(`  ${DEST}`)
console.log(`  Blocks written: ${blocks.length}`)
console.log(`  Hosts blocked: ${blocked.size}`)
