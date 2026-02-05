#!/usr/bin/env bun
/**
 * Validates that all NEXT_PUBLIC_* env vars from @webalive/env schema
 * are listed in turbo.json's build.env array.
 *
 * Run: bun scripts/validation/validate-turbo-env.ts
 * Exit: 0 if valid, 1 if missing vars
 *
 * This prevents the silent failure that occurs when a client env var is
 * defined in schema.ts but not in turbo.json - the var won't be baked
 * into the client bundle during build.
 */

import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "../..")

// Import client schema keys (use relative path - bun workspace resolution doesn't work from root scripts)
import { CLIENT_ENV_KEYS } from "../../packages/env/src/schema"

// Read turbo.json
const turboPath = resolve(ROOT, "turbo.json")
const turboConfig = JSON.parse(readFileSync(turboPath, "utf-8"))

// Get build.env array from turbo.json
const turboBuildEnv: string[] = turboConfig.tasks?.build?.env ?? []

// Find missing client env vars
const missing = CLIENT_ENV_KEYS.filter((v) => !turboBuildEnv.includes(v))

if (missing.length > 0) {
  console.error("❌ Missing from turbo.json tasks.build.env:")
  for (const v of missing) {
    console.error(`   - ${v}`)
  }
  console.error("")
  console.error("These NEXT_PUBLIC_* vars are defined in @webalive/env schema")
  console.error("but not in turbo.json, so they won't be baked into the client bundle.")
  console.error("")
  console.error("Fix: Add them to turbo.json tasks.build.env array")
  process.exit(1)
}

console.log("✓ All client env vars present in turbo.json build.env")
