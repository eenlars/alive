#!/usr/bin/env node
/**
 * Install Chrome browser for Puppeteer
 *
 * This script handles browser installation with proper error messages
 * and environment detection (local vs Docker vs CI).
 */

import { execSync } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"

const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  dim: "\x1b[2m",
}

function log(msg, color = COLORS.reset) {
  console.log(`${color}${msg}${COLORS.reset}`)
}

function logStep(msg) {
  log(`\n▸ ${msg}`, COLORS.blue)
}

function logSuccess(msg) {
  log(`✓ ${msg}`, COLORS.green)
}

function logError(msg) {
  log(`✗ ${msg}`, COLORS.red)
}

function logWarn(msg) {
  log(`⚠ ${msg}`, COLORS.yellow)
}

async function main() {
  log("\n🌐 Google Scraper MCP - Browser Setup\n", COLORS.blue)

  // Check if running in Docker (skip browser install)
  if (process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD === "true") {
    logWarn("PUPPETEER_SKIP_CHROMIUM_DOWNLOAD is set - skipping browser install")
    logWarn("Make sure system Chromium is available and PUPPETEER_EXECUTABLE_PATH is set")
    return
  }

  // Check if running in CI
  const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true"
  if (isCI) {
    log("Running in CI environment", COLORS.dim)
  }

  // Determine cache directory
  let cacheDir = process.env.PUPPETEER_CACHE_DIR
  if (!cacheDir) {
    const homeDir = process.env.HOME || process.env.USERPROFILE
    cacheDir = join(homeDir, ".cache", "puppeteer")
  }

  logStep(`Browser cache directory: ${cacheDir}`)

  // Ensure cache directory exists and is writable
  try {
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true })
      logSuccess("Created cache directory")
    }
  } catch (err) {
    logError(`Cannot create cache directory: ${err.message}`)
    logWarn("Try running with sudo or setting PUPPETEER_CACHE_DIR to a writable location")
    logWarn("Example: PUPPETEER_CACHE_DIR=/tmp/puppeteer bun run setup")
    process.exit(1)
  }

  // Install Chrome
  logStep("Installing Chrome for Puppeteer...")

  try {
    const cmd = "npx puppeteer browsers install chrome"
    const env = { ...process.env, PUPPETEER_CACHE_DIR: cacheDir }

    execSync(cmd, {
      stdio: "inherit",
      env,
      timeout: 300000, // 5 min timeout
    })

    logSuccess("Chrome installed successfully!")
  } catch (err) {
    logError("Failed to install Chrome")
    console.error(err.message)

    log("\nTroubleshooting:", COLORS.yellow)
    log("  1. Check disk space and permissions")
    log("  2. Try with custom cache dir:")
    log("     PUPPETEER_CACHE_DIR=/tmp/puppeteer bun run setup")
    log("  3. On Linux, you may need system dependencies:")
    log("     sudo apt-get install -y chromium-browser")
    log("  4. In Docker, use the provided Dockerfile which includes Chromium")

    process.exit(1)
  }

  // Verify installation
  logStep("Verifying installation...")

  try {
    const result = execSync("npx puppeteer browsers list", {
      encoding: "utf-8",
      env: { ...process.env, PUPPETEER_CACHE_DIR: cacheDir },
    })

    if (result.includes("chrome")) {
      logSuccess("Chrome is ready!")
      log(`\n${COLORS.dim}${result}${COLORS.reset}`)
    } else {
      logWarn("Chrome may not be installed correctly")
    }
  } catch {
    logWarn("Could not verify installation (non-critical)")
  }

  log("\n✅ Setup complete! You can now run the MCP server.\n", COLORS.green)
}

main().catch(err => {
  logError(`Unexpected error: ${err.message}`)
  process.exit(1)
})
