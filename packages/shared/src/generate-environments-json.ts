#!/usr/bin/env node

/**
 * Generates environments.json from TypeScript configuration
 * Used by bash scripts that need JSON format
 *
 * Run: bun run generate-json
 * Output: packages/shared/environments.json
 */

import * as fs from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { environments } from "./environments.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const output = {
  environments,
}

const outputPath = join(dirname(__dirname), "environments.json")

try {
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2))
  console.log(`✅ Generated ${outputPath}`)
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error)
  console.error(`❌ Failed to write environments.json to ${outputPath}`)
  console.error(`   Error: ${errorMessage}`)

  // Exit with error code to signal failure to calling scripts
  process.exit(1)
}
