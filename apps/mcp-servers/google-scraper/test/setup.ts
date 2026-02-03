/**
 * Test setup - verify browser is installed before running tests
 */

import { existsSync } from "node:fs"
import { join } from "node:path"

function findChrome(): string | null {
  // Check custom cache dir first
  const cacheDir = process.env.PUPPETEER_CACHE_DIR
  if (cacheDir) {
    const chromePath = join(cacheDir, "chrome")
    if (existsSync(chromePath)) {
      return chromePath
    }
  }

  // Check if PUPPETEER_EXECUTABLE_PATH is set (Docker)
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    if (existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
      return process.env.PUPPETEER_EXECUTABLE_PATH
    }
  }

  // Check default cache location
  const homeDir = process.env.HOME || process.env.USERPROFILE || ""
  const defaultCache = join(homeDir, ".cache", "puppeteer", "chrome")
  if (existsSync(defaultCache)) {
    return defaultCache
  }

  return null
}

export function ensureBrowserInstalled(): void {
  const chromePath = findChrome()

  if (!chromePath) {
    const cacheDir = process.env.PUPPETEER_CACHE_DIR || "~/.cache/puppeteer"

    console.error(`
╔═══════════════════════════════════════════════════════════════════╗
║                    BROWSER NOT INSTALLED                          ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  Chrome browser is required for these tests but was not found.   ║
║                                                                   ║
║  To install:                                                      ║
║                                                                   ║
║    bun run setup                                                  ║
║                                                                   ║
║  Or manually:                                                     ║
║                                                                   ║
║    npx puppeteer browsers install chrome                          ║
║                                                                   ║
║  If you have permission issues, set a custom cache directory:    ║
║                                                                   ║
║    PUPPETEER_CACHE_DIR=/tmp/puppeteer bun run setup               ║
║                                                                   ║
║  Current cache dir: ${cacheDir.padEnd(43)}║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
`)

    throw new Error(
      "Chrome browser not installed. Run 'bun run setup' first. " + "See error message above for details.",
    )
  }

  console.log(`✓ Chrome found: ${chromePath}`)
}

// Run check immediately when this module is imported
ensureBrowserInstalled()
