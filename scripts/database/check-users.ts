#!/usr/bin/env bun
/**
 * Check users in database
 */

import { createClient } from "@supabase/supabase-js"
import { getSupabaseCredentials } from "../apps/web/lib/env/server"
import type { IamDatabase } from "@webalive/database"

async function checkUsers() {
  const { url, key } = getSupabaseCredentials("service")
  const iam = createClient<IamDatabase>(url, key, { db: { schema: "iam" } })

  // Get all users
  const { data: allUsers } = await iam
    .from("users")
    .select("user_id, email, is_test_env, created_at")
    .order("created_at", { ascending: false })

  console.log(`Total users: ${allUsers?.length || 0}`)
  console.log()

  if (!allUsers || allUsers.length === 0) {
    console.log("❌ NO USERS IN DATABASE!")
    return
  }

  console.log("Users:")
  for (const user of allUsers) {
    const testFlag = user.is_test_env ? "[TEST]" : "[REAL]"
    console.log(`  ${testFlag} ${user.email} - ${new Date(user.created_at).toLocaleDateString()}`)
  }
}

checkUsers()
