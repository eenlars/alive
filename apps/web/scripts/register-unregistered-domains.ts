#!/usr/bin/env bun
/**
 * Register Unregistered Domains
 * Finds domains in infrastructure but not in Supabase, and registers them
 *
 * Usage: bun scripts/register-unregistered-domains.ts <email>
 *
 * Example: bun scripts/register-unregistered-domains.ts user@example.com
 *
 * NOTE: This script uses direct Supabase clients to avoid Next.js dependencies
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import type { AppDatabase, IamDatabase } from "@webalive/database"
import { FREE_CREDITS, PATHS } from "@webalive/shared"

// Bun automatically loads .env files

const [email] = process.argv.slice(2)

if (!email) {
  console.error("❌ Usage: bun scripts/register-unregistered-domains.ts <email>")
  console.error("   Example: bun scripts/register-unregistered-domains.ts user@example.com")
  process.exit(1)
}

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

function getPortFromRegistry(domain: string): number | null {
  const registryPath = PATHS.REGISTRY_PATH
  try {
    const data = JSON.parse(readFileSync(registryPath, "utf-8"))
    return data[domain]?.port ?? null
  } catch {
    return null
  }
}

// Domains that should NOT be registered (test domains, special cases)
const SKIP_DOMAINS = new Set([
  "api.sonno.tech", // API endpoint, not a user site
  // Add test domains here if needed
])

/**
 * Get or create a user by email (standalone version, no Next.js deps)
 */
async function getOrCreateUser(userEmail: string): Promise<string> {
  const { url, key } = getSupabaseCredentials()
  const iam = createClient<IamDatabase>(url, key, { db: { schema: "iam" } })

  // Check if user exists
  const { data: existingUser, error: userQueryError } = await iam
    .from("users")
    .select("user_id")
    .eq("email", userEmail)
    .single()

  if (existingUser) {
    return existingUser.user_id
  }

  if (userQueryError?.code !== "PGRST116") {
    throw new Error(`Failed to check user: ${userQueryError?.message}`)
  }

  // User doesn't exist - this shouldn't happen for the admin email
  throw new Error(`User ${userEmail} does not exist. Create account first.`)
}

/**
 * Get user's default org (standalone version, no Next.js deps)
 */
async function getUserDefaultOrgId(userId: string, userEmail: string): Promise<string> {
  const { url, key } = getSupabaseCredentials()
  const iam = createClient<IamDatabase>(url, key, { db: { schema: "iam" } })

  // Check if user has existing org
  const { data: existingMemberships, error: membershipsError } = await iam
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .eq("role", "owner")
    .order("created_at", { ascending: true })

  if (membershipsError) {
    throw new Error(`Failed to fetch memberships: ${membershipsError.message}`)
  }

  if (existingMemberships && existingMemberships.length > 0) {
    return existingMemberships[0].org_id
  }

  // Create new org
  const orgName = `${userEmail.split("@")[0]}'s organization`
  const { data: newOrg, error: orgError } = await iam
    .from("orgs")
    .insert({ name: orgName, credits: FREE_CREDITS, is_test_env: false })
    .select("org_id")
    .single()

  if (orgError || !newOrg) {
    throw new Error(`Failed to create org: ${orgError?.message}`)
  }

  // Create owner membership
  const { error: membershipError } = await iam.from("org_memberships").insert({
    org_id: newOrg.org_id,
    user_id: userId,
    role: "owner",
  })

  if (membershipError) {
    throw new Error(`Failed to create membership: ${membershipError.message}`)
  }

  return newOrg.org_id
}

/**
 * Register a single domain (standalone version, no Next.js deps)
 */
async function registerDomainStandalone(hostname: string, userEmail: string, port: number): Promise<void> {
  const { url, key } = getSupabaseCredentials()
  const app = createClient<AppDatabase>(url, key, { db: { schema: "app" } })

  // Check if domain already exists
  const { data: existingDomain } = await app.from("domains").select("hostname").eq("hostname", hostname).single()

  if (existingDomain) {
    throw new Error("Domain already registered")
  }

  // Get or create user
  const userId = await getOrCreateUser(userEmail)

  // Get user's default org
  const orgId = await getUserDefaultOrgId(userId, userEmail)

  // Create domain entry
  const { error: domainError } = await app.from("domains").insert({
    hostname,
    port,
    org_id: orgId,
    is_test_env: false,
  })

  if (domainError) {
    throw new Error(`Failed to register domain: ${domainError.message}`)
  }
}

async function main() {
  console.log(`🔍 Finding unregistered domains to register under: ${email}\n`)

  const registeredDomains = await getRegisteredDomains()
  const infrastructureDomains = getInfrastructureDomains()

  const unregistered = infrastructureDomains.filter(
    domain => !registeredDomains.has(domain) && !SKIP_DOMAINS.has(domain),
  )

  if (unregistered.length === 0) {
    console.log("✅ All domains are already registered!")
    return
  }

  console.log(`📋 Found ${unregistered.length} unregistered domains:\n`)

  let success = 0
  let failed = 0

  for (const domain of unregistered) {
    const port = getPortFromRegistry(domain)

    if (!port) {
      console.log(`⏭️  ${domain} - skipped (no port in registry)`)
      continue
    }

    try {
      await registerDomainStandalone(domain, email, port)
      console.log(`✅ ${domain} - registered (port ${port})`)
      success++
    } catch (err) {
      console.log(`❌ ${domain} - ${err instanceof Error ? err.message : "Unknown error"}`)
      failed++
    }
  }

  console.log(`\n📊 Results: ${success} registered, ${failed} failed`)
}

main().catch(err => {
  console.error("❌ Script failed:", err)
  process.exit(1)
})
