#!/usr/bin/env bun
/**
 * Test script to verify superadmin access control
 *
 * Tests that:
 * 1. Lars (superadmin) CAN access alive workspace
 * 2. Unauthenticated requests are blocked
 * 3. (Manual) Non-superadmin users are blocked by verifyWorkspaceAccess()
 *
 * Run: bun scripts/test-superadmin-access.ts
 */

import { randomUUID } from "node:crypto"

const DEV_SERVER = "http://localhost:8997"

// Test credentials - must be provided via environment variables
const TEST_EMAIL = process.env.TEST_SUPERADMIN_EMAIL
const TEST_PASSWORD = process.env.TEST_SUPERADMIN_PASSWORD

if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error("❌ Missing required environment variables:")
  console.error("   TEST_SUPERADMIN_EMAIL - Email of a superadmin user")
  console.error("   TEST_SUPERADMIN_PASSWORD - Password for that user")
  console.error("\nUsage: TEST_SUPERADMIN_EMAIL=admin@example.com TEST_SUPERADMIN_PASSWORD=xxx bun scripts/test-superadmin-access.ts")
  process.exit(1)
}

interface LoginResponse {
  ok: boolean
  error?: string
  message?: string
}

interface StreamResponse {
  ok: boolean
  error?: string
  message?: string
}

async function login(email: string, password: string): Promise<string | null> {
  console.log(`\n🔐 Logging in as ${email}...`)

  const res = await fetch(`${DEV_SERVER}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })

  const data = (await res.json()) as LoginResponse

  if (!res.ok || !data.ok) {
    console.log(`   ❌ Login failed: ${data.error || data.message || res.status}`)
    return null
  }

  // Extract session cookie from response
  const setCookie = res.headers.get("set-cookie")
  if (!setCookie) {
    console.log(`   ❌ No session cookie in response`)
    return null
  }

  // Parse the session cookie value (auth_session_v2 is the current cookie name)
  const match = setCookie.match(/auth_session_v2=([^;]+)/)
  if (!match) {
    console.log(`   ❌ Could not parse session cookie from: ${setCookie.substring(0, 100)}...`)
    return null
  }

  console.log(`   ✅ Login successful`)
  return match[1]
}

async function testClaudeBridgeAccess(sessionCookie: string, userLabel: string): Promise<boolean> {
  console.log(`\n🧪 Testing alive access for ${userLabel}...`)

  const res = await fetch(`${DEV_SERVER}/api/claude/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `auth_session_v2=${sessionCookie}`,
    },
    body: JSON.stringify({
      message: "Hello, just testing access",
      workspace: "alive",
      tabGroupId: randomUUID(),
      tabId: randomUUID(),
    }),
  })

  // For streaming endpoint, 401 means blocked, 200 means allowed
  if (res.status === 401) {
    const data = (await res.json()) as StreamResponse
    console.log(`   🚫 Access DENIED (401): ${data.error || data.message}`)
    return false
  }

  if (res.status === 200) {
    // Don't consume the whole stream, just check we got access
    console.log(`   ✅ Access GRANTED (200)`)
    // Abort the stream since we just wanted to test access
    return true
  }

  const data = (await res.json().catch(() => ({}))) as StreamResponse
  console.log(`   ⚠️ Unexpected status ${res.status}: ${JSON.stringify(data)}`)
  return false
}

async function testUnauthenticatedAccess(): Promise<boolean> {
  console.log(`\n🧪 Testing unauthenticated access to alive...`)

  const res = await fetch(`${DEV_SERVER}/api/claude/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `auth_session_v2=fake-invalid-token`,
    },
    body: JSON.stringify({
      message: "Hello, just testing access",
      workspace: "alive",
      tabGroupId: randomUUID(),
      tabId: randomUUID(),
    }),
  })

  // Should be blocked
  if (res.status === 200) {
    console.log(`   ❌ Access GRANTED - SECURITY ISSUE!`)
    return false
  }

  const data = (await res.json().catch(() => ({}))) as StreamResponse
  console.log(`   🚫 Access DENIED (${res.status}): ${data.error || data.message || "unknown"}`)
  return true
}

async function main() {
  console.log("=".repeat(60))
  console.log("🔒 SUPERADMIN ACCESS CONTROL TEST")
  console.log("=".repeat(60))
  console.log(`\nTarget: ${DEV_SERVER}`)
  console.log(`Superadmin workspace: alive`)

  let larsResult = false
  let unauthResult = false

  // Test 1: Superadmin (should have access)
  console.log("\n" + "-".repeat(60))
  console.log("TEST 1: Superadmin - SHOULD have access")
  console.log("-".repeat(60))

  const superadminSession = await login(TEST_EMAIL, TEST_PASSWORD)
  if (!superadminSession) {
    console.log("❌ Could not login as superadmin - skipping test")
  } else {
    const superadminAccess = await testClaudeBridgeAccess(superadminSession, "Superadmin")
    if (superadminAccess) {
      console.log("   ✅ PASS: Superadmin CAN access alive")
      larsResult = true
    } else {
      console.log("   ❌ FAIL: Superadmin should have access but was denied!")
    }
  }

  // Test 2: Unauthenticated (should NOT have access)
  console.log("\n" + "-".repeat(60))
  console.log("TEST 2: Unauthenticated request - should NOT have access")
  console.log("-".repeat(60))

  unauthResult = await testUnauthenticatedAccess()
  if (unauthResult) {
    console.log("   ✅ PASS: Unauthenticated correctly DENIED")
  } else {
    console.log("   ❌ FAIL: Unauthenticated should NOT have access!")
    console.log("   🚨 SECURITY ISSUE!")
  }

  // Summary
  console.log("\n" + "=".repeat(60))
  console.log("TEST SUMMARY")
  console.log("=".repeat(60))
  console.log(`\n  Superadmin access:          ${larsResult ? "✅ PASS" : "❌ FAIL"}`)
  console.log(`  Unauthenticated blocked:    ${unauthResult ? "✅ PASS" : "❌ FAIL"}`)

  if (larsResult && unauthResult) {
    console.log("\n🎉 ALL TESTS PASSED - Superadmin access control is working correctly!")
    console.log("\n📋 Note: The security enforcement for non-superadmin users with")
    console.log("   alive in their JWT is handled in verifyWorkspaceAccess()")
    console.log("   (features/auth/lib/auth.ts:257-267)")
  } else {
    console.log("\n⚠️  SOME TESTS FAILED - Check output above")
    process.exit(1)
  }
}

main().catch(console.error)
