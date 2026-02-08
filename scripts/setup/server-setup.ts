#!/usr/bin/env bun
/**
 * Server Setup Script
 *
 * Single command to set up a new server or update an existing one.
 * Reads configuration from server-config.json (via SERVER_CONFIG_PATH env var)
 *
 * Usage: bun run setup:server [--production] [--enable]
 */

import { execSync, spawn } from "node:child_process"
import { access, mkdir, readFile, copyFile, symlink, rm } from "node:fs/promises"
import { constants, existsSync } from "node:fs"

// =============================================================================
// Types & Constants
// =============================================================================

const CONFIG_PATH = process.env.SERVER_CONFIG_PATH
if (!CONFIG_PATH) {
  throw new Error("FATAL: SERVER_CONFIG_PATH env var is not set.")
}

const COLORS = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
}

const REQUIRED_TOOLS = [
  { name: "bun", install: "curl -fsSL https://bun.sh/install | bash" },
  { name: "caddy", install: "apt install caddy" },
  { name: "redis-cli", install: "apt install redis-server" },
]

// =============================================================================
// Helpers
// =============================================================================

function log(msg: string) {
  console.log(msg)
}

function ok(msg: string) {
  console.log(`${COLORS.green}✓${COLORS.reset} ${msg}`)
}

function fail(msg: string) {
  console.error(`${COLORS.red}✗${COLORS.reset} ${msg}`)
}

function warn(msg: string) {
  console.log(`${COLORS.yellow}⚠${COLORS.reset} ${msg}`)
}

function header(msg: string) {
  console.log(`\n${COLORS.bold}${COLORS.blue}▸ ${msg}${COLORS.reset}\n`)
}

function run(cmd: string, opts?: { cwd?: string; silent?: boolean }): boolean {
  try {
    execSync(cmd, {
      cwd: opts?.cwd,
      stdio: opts?.silent ? "pipe" : "inherit",
      encoding: "utf8",
    })
    return true
  } catch {
    return false
  }
}

function which(name: string): string | null {
  try {
    return execSync(`which ${name} 2>/dev/null`, { encoding: "utf8" }).trim() || null
  } catch {
    return null
  }
}

// =============================================================================
// Checks
// =============================================================================

async function checkPrerequisites(): Promise<{ ok: boolean; aliveRoot: string; generatedDir: string }> {
  header("Checking prerequisites")

  let allOk = true

  // Check required tools
  for (const tool of REQUIRED_TOOLS) {
    if (which(tool.name)) {
      ok(tool.name)
    } else {
      fail(`${tool.name} not found`)
      log(`  ${COLORS.dim}Install: ${tool.install}${COLORS.reset}`)
      allOk = false
    }
  }

  // Check server config
  let aliveRoot = ""
  let generatedDir = ""
  try {
    await access(CONFIG_PATH!, constants.R_OK)
    const raw = await readFile(CONFIG_PATH!, "utf8")
    const config = JSON.parse(raw)
    aliveRoot = config.paths?.aliveRoot
    generatedDir = config.generated?.dir

    if (!aliveRoot) {
      fail("paths.aliveRoot not set in config")
      allOk = false
    } else if (!existsSync(aliveRoot)) {
      fail(`aliveRoot does not exist: ${aliveRoot}`)
      allOk = false
    } else {
      ok(`server-config.json (aliveRoot: ${aliveRoot})`)
    }

    if (!generatedDir) {
      fail("generated.dir not set in config")
      allOk = false
    }
  } catch {
    fail(`${CONFIG_PATH} not found`)
    log(`  ${COLORS.dim}Fix: Set SERVER_CONFIG_PATH env var and create the config file${COLORS.reset}`)
    allOk = false
  }

  // Check Redis
  if (run("redis-cli ping", { silent: true })) {
    ok("Redis connection")
  } else {
    warn("Redis not responding (may need to start)")
  }

  return { ok: allOk, aliveRoot, generatedDir }
}

// =============================================================================
// Build
// =============================================================================

async function buildProduction(aliveRoot: string): Promise<boolean> {
  header("Building production")

  const buildDir = `${aliveRoot}/.builds/production`
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const buildPath = `${buildDir}/${timestamp}`

  // Create build directory
  await mkdir(buildPath, { recursive: true })

  log(`Building to: ${buildPath}`)

  // Run Next.js build
  if (!run(`bun run build`, { cwd: `${aliveRoot}/apps/web` })) {
    fail("Build failed")
    return false
  }

  // Copy standalone output
  const standaloneSrc = `${aliveRoot}/apps/web/.next/standalone`
  const standaloneDst = `${buildPath}/standalone`

  if (!existsSync(standaloneSrc)) {
    fail("Standalone output not found - check next.config.js has output: 'standalone'")
    return false
  }

  run(`cp -r "${standaloneSrc}" "${standaloneDst}"`)

  // Copy static files
  run(`cp -r "${aliveRoot}/apps/web/.next/static" "${standaloneDst}/apps/web/.next/"`)
  run(`cp -r "${aliveRoot}/apps/web/public" "${standaloneDst}/apps/web/"`)

  // Update symlink
  const currentLink = `${buildDir}/current`
  await rm(currentLink, { force: true })
  await symlink(buildPath, currentLink)

  ok(`Build complete: ${buildPath}`)
  ok(`Symlinked: ${currentLink}`)

  return true
}

// =============================================================================
// Services
// =============================================================================

async function setupServices(aliveRoot: string, generatedDir: string, enable: boolean): Promise<boolean> {
  header("Setting up systemd services")

  // Generate services
  if (!run(`bun run gen:systemd`, { cwd: aliveRoot })) {
    fail("Failed to generate services")
    return false
  }

  // Install services
  run(`cp ${generatedDir}/alive-*.service /etc/systemd/system/`)
  run(`systemctl daemon-reload`)
  ok("Services installed")

  if (enable) {
    run(`systemctl enable alive-dev`)
    run(`systemctl enable alive-production`)
    ok("Services enabled for auto-start")
  }

  return true
}

async function startServices(production: boolean): Promise<void> {
  header("Starting services")

  // Stop old instances
  run(`systemctl stop alive-dev 2>/dev/null || true`, { silent: true })
  run(`systemctl stop alive-production 2>/dev/null || true`, { silent: true })

  if (production) {
    run(`systemctl start alive-production`)
    if (run(`systemctl is-active alive-production`, { silent: true })) {
      ok("alive-production running on port 9000")
    } else {
      fail("Failed to start production")
      log(`  ${COLORS.dim}Check: journalctl -u alive-production -n 50${COLORS.reset}`)
    }
  } else {
    run(`systemctl start alive-dev`)
    if (run(`systemctl is-active alive-dev`, { silent: true })) {
      ok("alive-dev running on port 8997")
    } else {
      fail("Failed to start dev")
      log(`  ${COLORS.dim}Check: journalctl -u alive-dev -n 50${COLORS.reset}`)
    }
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = process.argv.slice(2)
  const production = args.includes("--production") || args.includes("-p")
  const enable = args.includes("--enable") || args.includes("-e")

  console.log(`
${COLORS.bold}╔═══════════════════════════════════════╗
║     Alive Server Setup                ║
╚═══════════════════════════════════════╝${COLORS.reset}
`)

  // Check prerequisites
  const prereq = await checkPrerequisites()
  if (!prereq.ok) {
    log(`\n${COLORS.red}Fix the above issues and run again.${COLORS.reset}\n`)
    process.exit(1)
  }

  const aliveRoot = prereq.aliveRoot
  const generatedDir = prereq.generatedDir

  // Generate routing
  header("Generating routing config")
  run(`bun run gen:routing`, { cwd: aliveRoot })

  // Build if production
  if (production) {
    const built = await buildProduction(aliveRoot)
    if (!built) {
      process.exit(1)
    }
  }

  // Setup services
  await setupServices(aliveRoot, generatedDir, enable)

  // Start services
  await startServices(production)

  // Summary
  console.log(`
${COLORS.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLORS.reset}
${COLORS.green}${COLORS.bold}Setup complete!${COLORS.reset}

${COLORS.dim}Useful commands:${COLORS.reset}
  bun run see         # View production logs
  bun run see:dev     # View dev logs
  bun run gen:all     # Regenerate all configs
  systemctl status alive-*
`)
}

main().catch(e => {
  console.error(`${COLORS.red}Fatal:${COLORS.reset}`, e.message)
  process.exit(1)
})
