#!/usr/bin/env bun
/**
 * OAuth Core Verification Script
 *
 * Verifies that the OAuth Core package works correctly with Supabase lockbox:
 * - Environment configuration
 * - Encryption/decryption
 * - Database storage (bytea format)
 * - Provider configuration
 * - Token storage and retrieval
 *
 * REQUIREMENTS:
 * - Valid user UUIDs in environment variables (TEST_TENANT_ID, TEST_USER_ID)
 * - Users must exist in iam.users table (for foreign key constraints)
 * - Supabase lockbox schema must be set up (run setup-schema.sql first)
 */

import { oauth } from "../src/index.js"
import { createClient } from "@supabase/supabase-js"
import { Security } from "../src/security.js"

// Test user IDs - MUST be valid UUIDs from iam.users
const MOCK_TENANT_ID = process.env.TEST_TENANT_ID || "CHANGE_ME"
const MOCK_USER_ID = process.env.TEST_USER_ID || "CHANGE_ME"

async function verify() {
  console.log("🔐 OAuth Core Verification\n")
  console.log("=====================================\n")

  // Check environment
  if (MOCK_TENANT_ID === "CHANGE_ME" || MOCK_USER_ID === "CHANGE_ME") {
    console.error("❌ ERROR: Set TEST_TENANT_ID and TEST_USER_ID environment variables")
    console.error("   These must be valid user UUIDs from iam.users table\n")
    process.exit(1)
  }

  try {
    // Test 1: Encryption
    console.log("1️⃣  Testing Encryption Layer...")
    const testSecret = "super_secret_token_abc123"
    const encrypted = Security.encrypt(testSecret)

    if (!encrypted.ciphertext.startsWith("\\x")) {
      throw new Error("Ciphertext not in bytea format")
    }
    if (!encrypted.iv.startsWith("\\x")) {
      throw new Error("IV not in bytea format")
    }
    if (!encrypted.authTag.startsWith("\\x")) {
      throw new Error("Auth tag not in bytea format")
    }

    const decrypted = Security.decrypt(encrypted.ciphertext, encrypted.iv, encrypted.authTag)

    if (decrypted !== testSecret) {
      throw new Error("Decryption failed - plaintext mismatch")
    }

    console.log("✅ Encryption/Decryption working correctly\n")

    // Test 2: Provider Config
    console.log("2️⃣  Setting Provider Config (Tenant OAuth App Credentials)...")
    await oauth.setProviderConfig(MOCK_TENANT_ID, "github", {
      client_id: "gh_test_id_123",
      client_secret: "gh_test_secret_xyz",
      redirect_uri: "https://example.com/auth/callback",
    })
    console.log("✅ Provider config saved\n")

    // Test 3: Retrieve Config
    console.log("3️⃣  Retrieving Provider Config...")
    const config = await oauth.getProviderConfig(MOCK_TENANT_ID, "github")

    if (!config) {
      throw new Error("Failed to retrieve provider config")
    }

    if (config.client_id !== "gh_test_id_123") {
      throw new Error("Client ID mismatch")
    }

    if (config.client_secret !== "gh_test_secret_xyz") {
      throw new Error("Client secret mismatch")
    }

    console.log("Retrieved config:", {
      client_id: config.client_id,
      redirect_uri: config.redirect_uri,
    })
    console.log("✅ Config retrieved and decrypted correctly\n")

    // Test 4: Database Verification
    console.log("4️⃣  Verifying Database Storage...")
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

    const { data, error } = await supabase
      .schema("lockbox")
      .from("user_secrets")
      .select("*")
      .eq("clerk_id", MOCK_TENANT_ID)
      .eq("name", "github_client_secret")
      .eq("is_current", true)
      .single()

    if (error) {
      throw new Error(`Database query failed: ${error.message}`)
    }

    console.log("Raw DB Record:", {
      namespace: data.namespace,
      name: data.name,
      ciphertext_format: `${data.ciphertext.toString().substring(0, 10)}...`,
      iv_format: `${data.iv.toString().substring(0, 10)}...`,
      iv_length: Buffer.from(data.iv).length,
      auth_tag_length: Buffer.from(data.auth_tag).length,
      is_current: data.is_current,
    })

    // Verify bytea format
    const ciphertextStr = data.ciphertext.toString()
    if (!ciphertextStr.startsWith("\\x")) {
      throw new Error("Ciphertext not in bytea hex format")
    }

    console.log("✅ Bytea format verified (\\x prefix present)\n")

    // Test 5: Token Storage
    console.log("5️⃣  Testing User Token Storage...")
    await oauth.saveTokens(MOCK_USER_ID, "github", {
      access_token: "gho_test_token_abc123def456",
      refresh_token: "ghr_refresh_xyz789",
      scope: "repo,user,gist",
      token_type: "bearer",
      expires_in: 28800, // 8 hours
    })
    console.log("✅ Tokens saved\n")

    // Test 6: Token Retrieval
    console.log("6️⃣  Retrieving User Access Token...")
    const token = await oauth.getAccessToken(MOCK_USER_ID, "github")

    if (token !== "gho_test_token_abc123def456") {
      throw new Error("Token mismatch")
    }

    console.log("Retrieved token:", `${token.substring(0, 20)}...`)
    console.log("✅ Token retrieved successfully\n")

    // Test 7: Connection Check
    console.log("7️⃣  Testing Connection Check...")
    const isConnected = await oauth.isConnected(MOCK_USER_ID, "github")

    if (!isConnected) {
      throw new Error("User should be connected to GitHub")
    }

    console.log("✅ Connection status verified\n")

    // Test 8: Refresh Token
    console.log("8️⃣  Retrieving Refresh Token...")
    const refreshToken = await oauth.getRefreshToken(MOCK_USER_ID, "github")

    if (refreshToken !== "ghr_refresh_xyz789") {
      throw new Error("Refresh token mismatch")
    }

    console.log("✅ Refresh token retrieved\n")

    // Success
    console.log("=====================================")
    console.log("🎉 ALL VERIFICATION CHECKS PASSED! 🎉")
    console.log("=====================================\n")

    console.log("Next steps:")
    console.log("1. Run: bun run build")
    console.log("2. Add @webalive/oauth-core to apps/web/package.json")
    console.log("3. Create OAuth callback routes in apps/web")
    console.log("4. Test with real GitHub OAuth flow\n")
  } catch (error) {
    console.error("\n❌ VERIFICATION FAILED\n")
    console.error("Error:", error instanceof Error ? error.message : error)
    console.error("\nStack trace:", error instanceof Error ? error.stack : "")
    process.exit(1)
  }
}

// Run verification
verify()
