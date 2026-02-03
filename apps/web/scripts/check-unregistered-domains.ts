#!/usr/bin/env bun
/**
 * Check Unregistered Domains
 * Finds domains that exist in infrastructure but not in Supabase
 *
 * Usage: bun scripts/check-unregistered-domains.ts
 *
 * This is a READ-ONLY script - it only reports discrepancies
 */

import { existsSync, readdirSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import type { AppDatabase } from "@webalive/database"
import { PATHS } from "@webalive/shared"

// Bun automatically loads .env files

function getSupabaseCredentials() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error("❌ Missing Supabase credentials")
    console.error("   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env")
    process.exit(1)
  }

  return { url, key }
}

async function getRegisteredDomains(): Promise<Set<string>> {
  const { url, key } = getSupabaseCredentials()
  const app = createClient<AppDatabase>(url, key, {
    db: { schema: "app" },
  })

  const { data: domains, error } = await app.from("domains").select("hostname")

  if (error) {
    console.error("❌ Failed to fetch domains from Supabase:", error.message)
    process.exit(1)
  }

  return new Set(domains?.map(d => d.hostname) ?? [])
}

function getInfrastructureDomains(): string[] {
  const sitesDir = PATHS.SITES_ROOT
  if (!existsSync(sitesDir)) {
    console.error(`❌ Sites directory not found: ${sitesDir}`)
    process.exit(1)
  }

  return readdirSync(sitesDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
    .filter(name => name.includes(".")) // Only domains (contain a dot)
}

async function main() {
  console.log("🔍 Checking for unregistered domains...\n")

  const registeredDomains = await getRegisteredDomains()
  const infrastructureDomains = getInfrastructureDomains()

  const unregistered: string[] = []
  const orphaned: string[] = []

  // Find domains in infrastructure but not in database
  for (const domain of infrastructureDomains) {
    if (!registeredDomains.has(domain)) {
      unregistered.push(domain)
    }
  }

  // Find domains in database but not in infrastructure
  for (const domain of registeredDomains) {
    if (!infrastructureDomains.includes(domain)) {
      orphaned.push(domain)
    }
  }

  // Report results
  console.log(`📊 Infrastructure domains: ${infrastructureDomains.length}`)
  console.log(`📊 Registered domains: ${registeredDomains.size}`)
  console.log()

  if (unregistered.length === 0 && orphaned.length === 0) {
    console.log("✅ All domains are properly registered!")
    return
  }

  if (unregistered.length > 0) {
    console.log(`⚠️  Unregistered domains (in infra, not in DB): ${unregistered.length}`)
    for (const domain of unregistered) {
      console.log(`   - ${domain}`)
    }
    console.log()
    console.log("   To register these domains, use the deploy API or manually add to Supabase")
  }

  if (orphaned.length > 0) {
    console.log(`\n⚠️  Orphaned domains (in DB, not in infra): ${orphaned.length}`)
    for (const domain of orphaned) {
      console.log(`   - ${domain}`)
    }
    console.log()
    console.log("   These may be old entries that should be cleaned up")
  }
}

main().catch(err => {
  console.error("❌ Script failed:", err)
  process.exit(1)
})
