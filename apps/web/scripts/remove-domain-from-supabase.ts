#!/usr/bin/env bun
/**
 * Remove Domain from Supabase
 * Called by delete-site.sh to remove domains from Supabase
 *
 * Usage: bun scripts/remove-domain-from-supabase.ts <domain>
 */

import { unregisterDomain } from "../lib/deployment/domain-registry"

// Parse arguments
const [hostname] = process.argv.slice(2)

if (!hostname) {
  console.error("❌ Usage: bun scripts/remove-domain-from-supabase.ts <domain>")
  process.exit(1)
}

async function main() {
  const success = await unregisterDomain(hostname)

  if (!success) {
    console.error(`❌ Failed to unregister ${hostname}`)
    process.exit(1)
  }

  console.log(`✅ Successfully unregistered ${hostname}`)
}

main()
