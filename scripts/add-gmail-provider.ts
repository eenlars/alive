/**
 * Add Gmail provider to integrations.providers table
 *
 * Run with: cd apps/web && bun run ../../scripts/add-gmail-provider.ts
 */

import { createClient } from "@supabase/supabase-js"

async function addGmailProvider() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    process.exit(1)
  }

  // Create client for integrations schema
  const integrations = createClient(supabaseUrl, supabaseServiceKey, {
    db: { schema: "integrations" },
  })

  // Create client for iam schema
  const iam = createClient(supabaseUrl, supabaseServiceKey, {
    db: { schema: "iam" },
  })

  console.log("Adding Gmail provider to integrations.providers...")

  // Insert Gmail provider
  const { data, error } = await integrations
    .from("providers")
    .upsert(
      {
        provider_key: "gmail",
        display_name: "Gmail",
        visibility_level: "admin_only", // Start with admin-only, can change to public later
        is_active: true,
        logo_path: null, // Can add later
        default_scopes: [
          "https://mail.google.com/",
          "https://www.googleapis.com/auth/gmail.modify",
          "https://www.googleapis.com/auth/userinfo.profile",
          "https://www.googleapis.com/auth/userinfo.email",
        ],
      },
      { onConflict: "provider_key" },
    )
    .select()

  if (error) {
    console.error("Failed to add Gmail provider:", error)
    process.exit(1)
  }

  console.log("Gmail provider added:", data)

  // Grant access to admin user (optional - set ADMIN_EMAIL env var)
  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail) {
    console.log("No ADMIN_EMAIL set, skipping access policy grant")
    console.log("To grant access: ADMIN_EMAIL=admin@example.com bun run scripts/add-gmail-provider.ts")
  } else {
    console.log(`Granting access to ${adminEmail}...`)

    // First get the provider_id
    const { data: provider } = await integrations
      .from("providers")
      .select("provider_id")
      .eq("provider_key", "gmail")
      .single()

    if (!provider) {
      console.error("Could not find gmail provider")
      process.exit(1)
    }

    // Get the user_id for the admin
    const { data: user } = await iam.from("users").select("user_id").eq("email", adminEmail).single()

    if (!user) {
      console.log(`User ${adminEmail} not found, skipping access policy`)
    } else {
      // Add access policy
      const { error: policyError } = await integrations.from("access_policies").upsert(
        {
          provider_id: provider.provider_id,
          user_id: user.user_id,
        },
        { onConflict: "provider_id,user_id" },
      )

      if (policyError) {
        console.error("Failed to add access policy:", policyError)
      } else {
        console.log(`Access policy added for ${adminEmail}`)
      }
    }
  }

  console.log("\nDone! Gmail integration is now available.")
}

addGmailProvider().catch(console.error)
