#!/usr/bin/env bun
/**
 * Clean up orphaned organizations (orgs with no members)
 *
 * Usage:
 *   bun scripts/cleanup-orphaned-orgs.ts           # Dry run
 *   bun scripts/cleanup-orphaned-orgs.ts --force   # Actually delete
 */

import { createClient } from "@supabase/supabase-js"
import { getSupabaseCredentials } from "../apps/web/lib/env/server"
import type { IamDatabase } from "@webalive/database"
import type { AppDatabase } from "@webalive/database"

async function cleanupOrphanedOrgs(dryRun: boolean = true) {
  const { url, key } = getSupabaseCredentials("service")

  const iam = createClient<IamDatabase>(url, key, { db: { schema: "iam" } })
  const app = createClient<AppDatabase>(url, key, { db: { schema: "app" } })

  console.log(`🧹 Finding orphaned organizations... ${dryRun ? "(DRY RUN)" : "(FORCE)"}`)
  console.log()

  // Get all orgs
  const { data: allOrgs } = await iam.from("orgs").select("org_id, name, created_at")

  if (!allOrgs || allOrgs.length === 0) {
    console.log("No orgs found")
    return { deleted: 0 }
  }

  console.log(`📊 Total orgs in database: ${allOrgs.length}`)

  // Find orgs with no members
  const orphanedOrgs = []
  for (const org of allOrgs) {
    const { data: members } = await iam.from("org_memberships").select("user_id").eq("org_id", org.org_id).limit(1)

    if (!members || members.length === 0) {
      orphanedOrgs.push(org)
    }
  }

  console.log(`📊 Orphaned orgs (no members): ${orphanedOrgs.length}`)
  console.log()

  if (orphanedOrgs.length === 0) {
    console.log("✅ No orphaned orgs to clean up!")
    return { deleted: 0 }
  }

  console.log("Orphaned organizations:")
  for (const org of orphanedOrgs) {
    console.log(`  - ${org.name} (${org.org_id}) - created ${new Date(org.created_at).toLocaleDateString()}`)
  }
  console.log()

  if (dryRun) {
    console.log("⚠️  DRY RUN - No data will be deleted")
    console.log(`\nTo actually delete these ${orphanedOrgs.length} orgs, run:`)
    console.log(`  bun scripts/cleanup-orphaned-orgs.ts --force`)
    return { deleted: orphanedOrgs.length }
  }

  // Actually delete
  console.log("🗑️  Deleting orphaned organizations...")

  let deleted = 0
  for (const org of orphanedOrgs) {
    // Delete domains first
    await app.from("domains").delete().eq("org_id", org.org_id)

    // Delete invites
    await iam.from("org_invites").delete().eq("org_id", org.org_id)

    // Delete org
    const { error } = await iam.from("orgs").delete().eq("org_id", org.org_id)

    if (!error) {
      deleted++
      console.log(`  ✓ Deleted: ${org.name}`)
    } else {
      console.error(`  ✗ Failed: ${org.name} - ${error.message}`)
    }
  }

  console.log(`\n✅ Deleted ${deleted} orphaned organizations`)
  return { deleted }
}

const args = process.argv.slice(2)
const forceDelete = args.includes("--force")

cleanupOrphanedOrgs(!forceDelete)
  .then(stats => {
    console.log("\n" + "=".repeat(50))
    console.log(`Total: ${stats.deleted} organizations`)
    process.exit(0)
  })
  .catch(error => {
    console.error("\n❌ Cleanup failed:", error)
    process.exit(1)
  })
