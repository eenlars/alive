#!/usr/bin/env bun
/**
 * Nuclear clean: removes ALL build artifacts, caches, and temporary files from the monorepo.
 * Usage: bun run superclean
 */

import { execSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"

const rootDir = join(import.meta.dirname, "..")

console.log("Starting superclean...\n")

try {
  console.log("→ Removing node_modules...")
  execSync('find . -name "node_modules" -type d -prune -exec rm -rf "{}" +', {
    cwd: rootDir,
    stdio: "inherit",
  })

  console.log("→ Removing dist folders...")
  execSync('find . -name "dist" -type d -prune -exec rm -rf "{}" +', {
    cwd: rootDir,
    stdio: "inherit",
  })

  console.log("→ Removing .turbo cache folders...")
  execSync('find . -name ".turbo" -type d -prune -exec rm -rf "{}" +', {
    cwd: rootDir,
    stdio: "inherit",
  })

  console.log("→ Removing .tmp directories...")
  execSync('find . -name ".tmp" -type d -prune -exec rm -rf "{}" +', {
    cwd: rootDir,
    stdio: "inherit",
  })

  console.log("→ Removing .cache directories...")
  execSync('find . -name ".cache" -type d -prune -exec rm -rf "{}" +', {
    cwd: rootDir,
    stdio: "inherit",
  })

  console.log("→ Removing .next directories...")
  execSync('find . -name ".next" -type d -prune -exec rm -rf "{}" +', {
    cwd: rootDir,
    stdio: "inherit",
  })

  console.log("→ Removing coverage directories...")
  execSync('find . -name "coverage" -type d -prune -exec rm -rf "{}" +', {
    cwd: rootDir,
    stdio: "inherit",
  })

  console.log("→ Removing .tsbuildinfo files...")
  execSync('find . -name "*.tsbuildinfo" -type f -exec rm -f "{}" +', {
    cwd: rootDir,
    stdio: "inherit",
  })

  console.log("→ Removing bun.lock files...")
  execSync('find . -name "bun.lock" -type f -exec rm -f "{}" +', {
    cwd: rootDir,
    stdio: "inherit",
  })

  console.log("→ Removing .DS_Store files...")
  execSync('find . -name ".DS_Store" -type f -exec rm -f "{}" +', {
    cwd: rootDir,
    stdio: "inherit",
  })

  console.log("\nReinstalling dependencies...")
  execSync("bun install", {
    cwd: rootDir,
    stdio: "inherit",
  })

  console.log("\nRebuilding packages...")
  try {
    const envFile = join(rootDir, ".env")
    const envLocalFile = join(rootDir, ".env.local")
    const hasEnv = existsSync(envFile)
    const hasEnvLocal = existsSync(envLocalFile)

    const envFlags = [hasEnv ? "--env-file .env" : "", hasEnvLocal ? "--env-file .env.local" : ""]
      .filter(Boolean)
      .join(" ")

    const bunPrefix = envFlags ? `bun ${envFlags}` : "bun"

    execSync(`${bunPrefix} turbo run build`, {
      cwd: rootDir,
      stdio: "inherit",
    })
  } catch {
    console.warn("Build failed, but dependencies are installed")
    console.warn("You may need to run 'bun run build' manually after fixing any issues")
    process.exit(0)
  }

  console.log("\n✅ Superclean completed successfully")
} catch (error) {
  console.error("Error during superclean:", error)
  process.exit(1)
}
