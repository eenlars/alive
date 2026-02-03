/**
 * Supabase Credit System Integration Tests
 *
 * Tests the complete credit flow with Supabase PostgreSQL:
 * 1. Reading credits from iam.orgs
 * 2. Deducting credits when Claude is used
 * 3. Updating database correctly
 * 4. Handling insufficient credits
 * 5. Domain → Org mapping via app.domains
 *
 * @vitest-environment node
 */

import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { llmTokensToCredits } from "@/lib/credits"
import { assertSupabaseManagementEnv, assertSupabaseServiceEnv } from "@/lib/test-helpers/integration-env"
import {
  calculateLLMTokenCost,
  chargeTokensFromCredits,
  ensureSufficientCredits,
  getOrgCredits,
  hasEnoughCredits,
  type LLMTokenUsage,
  updateOrgCredits,
  WORKSPACE_CREDIT_DISCOUNT,
} from "@/lib/tokens"
import { createTestAppClient, createTestIamClient } from "./supabase-test-utils"

assertSupabaseServiceEnv()
assertSupabaseManagementEnv()

describe("Supabase Credit System Integration", () => {
  const TEST_ORG_ID = `test-org-${Date.now()}`
  const TEST_DOMAIN = `test-credits-${Date.now()}.example.com`
  const INITIAL_CREDITS = 100

  beforeAll(async () => {
    // Create test org with credits in IAM schema
    const iam = createTestIamClient()
    const { error: orgError } = await iam.from("orgs").insert({
      org_id: TEST_ORG_ID,
      name: "Test Organization",
      credits: INITIAL_CREDITS,
      is_test_env: true,
    })

    if (orgError) {
      throw new Error(`Failed to create test org: ${orgError.message}`)
    }

    // Create test domain in app schema linking to org
    const app = createTestAppClient()
    const { error: domainError } = await app.from("domains").insert({
      hostname: TEST_DOMAIN,
      port: 9999,
      org_id: TEST_ORG_ID,
      is_test_env: true,
    })

    if (domainError) {
      throw new Error(`Failed to create test domain: ${domainError.message}`)
    }
  })

  afterAll(async () => {
    // Clean up test data
    const app = createTestAppClient()
    const iam = createTestIamClient()

    await app.from("domains").delete().eq("hostname", TEST_DOMAIN)
    await iam.from("orgs").delete().eq("org_id", TEST_ORG_ID)
  })

  describe("getOrgCredits()", () => {
    test("should load credits from Supabase via domain → org mapping", async () => {
      const credits = await getOrgCredits(TEST_DOMAIN)
      expect(credits).toBe(INITIAL_CREDITS)
    })

    test("should return null for non-existent domain", async () => {
      const credits = await getOrgCredits("non-existent-domain.com")
      expect(credits).toBeNull()
    })

    test("should return 0 for org with 0 credits", async () => {
      await updateOrgCredits(TEST_DOMAIN, 0)
      const credits = await getOrgCredits(TEST_DOMAIN)
      expect(credits).toBe(0)

      // Reset for other tests
      await updateOrgCredits(TEST_DOMAIN, INITIAL_CREDITS)
    })
  })

  describe("chargeTokensFromCredits()", () => {
    test("should deduct credits from Supabase when charging", async () => {
      const llmTokensUsed = 1000
      const expectedCreditsUsed = llmTokensToCredits(llmTokensUsed) // 10 credits
      const _expectedCharged = Math.floor(expectedCreditsUsed * WORKSPACE_CREDIT_DISCOUNT * 100) / 100 // 2.5 credits
      const expectedNewBalance = Math.round((INITIAL_CREDITS - _expectedCharged) * 100) / 100 // 97.5

      const newBalance = await chargeTokensFromCredits(TEST_DOMAIN, llmTokensUsed)

      expect(newBalance).toBe(expectedNewBalance)

      // Verify Supabase was actually updated
      const dbBalance = await getOrgCredits(TEST_DOMAIN)
      expect(dbBalance).toBe(expectedNewBalance)

      // Reset for other tests
      await updateOrgCredits(TEST_DOMAIN, INITIAL_CREDITS)
    })

    test("should handle multiple sequential charges correctly", async () => {
      const llmTokensPerCharge = 500
      const creditsPerCharge = llmTokensToCredits(llmTokensPerCharge) // 5 credits
      const chargedPerRequest = Math.floor(creditsPerCharge * WORKSPACE_CREDIT_DISCOUNT * 100) / 100 // 1.25 credits

      await chargeTokensFromCredits(TEST_DOMAIN, llmTokensPerCharge)
      await chargeTokensFromCredits(TEST_DOMAIN, llmTokensPerCharge)
      const finalBalance = await chargeTokensFromCredits(TEST_DOMAIN, llmTokensPerCharge)

      const expectedBalance = Math.round((INITIAL_CREDITS - chargedPerRequest * 3) * 100) / 100
      expect(finalBalance).toBe(expectedBalance)

      // Verify in Supabase
      const dbBalance = await getOrgCredits(TEST_DOMAIN)
      expect(dbBalance).toBe(expectedBalance)

      // Reset for other tests
      await updateOrgCredits(TEST_DOMAIN, INITIAL_CREDITS)
    })

    test("should return null when charging more than available balance", async () => {
      // Set low balance
      await updateOrgCredits(TEST_DOMAIN, 1)

      // Try to charge 10 credits worth (1000 LLM tokens = 10 credits, 25% = 2.5 credits charged)
      const llmTokensUsed = 1000
      const result = await chargeTokensFromCredits(TEST_DOMAIN, llmTokensUsed)

      expect(result).toBeNull()

      // Balance should remain unchanged
      const balance = await getOrgCredits(TEST_DOMAIN)
      expect(balance).toBe(1)

      // Reset for other tests
      await updateOrgCredits(TEST_DOMAIN, INITIAL_CREDITS)
    })

    test("should return null for non-existent domain", async () => {
      const result = await chargeTokensFromCredits("non-existent.com", 100)
      expect(result).toBeNull()
    })

    test("should return null for negative token amount", async () => {
      const result = await chargeTokensFromCredits(TEST_DOMAIN, -100)
      expect(result).toBeNull()

      // Balance should remain unchanged
      const balance = await getOrgCredits(TEST_DOMAIN)
      expect(balance).toBe(INITIAL_CREDITS)
    })

    test("should apply discount correctly (25%)", async () => {
      const llmTokensUsed = 1000 // 10 credits
      const _expectedCreditsUsed = 10
      const _expectedCharged = 2.5 // 25% of 10
      const expectedBalance = 97.5 // 100 - 2.5

      const newBalance = await chargeTokensFromCredits(TEST_DOMAIN, llmTokensUsed)
      expect(newBalance).toBe(expectedBalance)

      // Reset for other tests
      await updateOrgCredits(TEST_DOMAIN, INITIAL_CREDITS)
    })
  })

  describe("hasEnoughCredits()", () => {
    test("should return true when credits are sufficient", async () => {
      const hasCredits = await hasEnoughCredits(TEST_DOMAIN, 50)
      expect(hasCredits).toBe(true)
    })

    test("should return false when credits are insufficient", async () => {
      const hasCredits = await hasEnoughCredits(TEST_DOMAIN, 150)
      expect(hasCredits).toBe(false)
    })

    test("should return false for non-existent domain", async () => {
      const hasCredits = await hasEnoughCredits("non-existent.com", 10)
      expect(hasCredits).toBe(false)
    })

    test("should return true when credits exactly match required", async () => {
      const hasCredits = await hasEnoughCredits(TEST_DOMAIN, INITIAL_CREDITS)
      expect(hasCredits).toBe(true)
    })
  })

  describe("ensureSufficientCredits()", () => {
    test("should not throw when credits are sufficient", async () => {
      await expect(ensureSufficientCredits(TEST_DOMAIN)).resolves.toBeUndefined()
    })

    test("should throw when credits are 0", async () => {
      await updateOrgCredits(TEST_DOMAIN, 0)
      await expect(ensureSufficientCredits(TEST_DOMAIN)).rejects.toThrow("Insufficient credits")

      // Reset for other tests
      await updateOrgCredits(TEST_DOMAIN, INITIAL_CREDITS)
    })

    test("should throw for non-existent domain", async () => {
      await expect(ensureSufficientCredits("non-existent.com")).rejects.toThrow("Workspace not found")
    })
  })

  describe("calculateLLMTokenCost()", () => {
    test("should calculate total tokens correctly", () => {
      const usage: LLMTokenUsage = {
        input_tokens: 100,
        output_tokens: 50,
      }
      expect(calculateLLMTokenCost(usage)).toBe(150)
    })

    test("should ignore cache tokens", () => {
      const usage: LLMTokenUsage = {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 200,
        cache_read_input_tokens: 300,
      }
      // Should only count input + output, ignore cache
      expect(calculateLLMTokenCost(usage)).toBe(150)
    })
  })

  describe("Real-world scenarios", () => {
    test("should handle realistic Claude API response usage", async () => {
      // Simulate typical Claude API response
      const usage: LLMTokenUsage = {
        input_tokens: 523,
        output_tokens: 1247,
      }

      const totalLLMTokens = calculateLLMTokenCost(usage) // 1770 tokens
      const credits = llmTokensToCredits(totalLLMTokens) // 17.7 credits
      const charged = Math.floor(credits * WORKSPACE_CREDIT_DISCOUNT * 100) / 100 // 4.42 credits

      const newBalance = await chargeTokensFromCredits(TEST_DOMAIN, totalLLMTokens)
      const expectedBalance = Math.round((INITIAL_CREDITS - charged) * 100) / 100 // 95.58

      expect(newBalance).toBe(expectedBalance)

      // Reset for other tests
      await updateOrgCredits(TEST_DOMAIN, INITIAL_CREDITS)
    })

    test("should handle very small token amounts", async () => {
      const llmTokensUsed = 10 // 0.1 credits = 0.025 charged (floored to 0.02)
      const newBalance = await chargeTokensFromCredits(TEST_DOMAIN, llmTokensUsed)

      expect(newBalance).toBe(99.98) // 100 - 0.02 (floored)

      // Reset for other tests
      await updateOrgCredits(TEST_DOMAIN, INITIAL_CREDITS)
    })

    test("should prevent overdraft", async () => {
      // Set balance to 5 credits
      await updateOrgCredits(TEST_DOMAIN, 5)

      // Try to charge 30 credits worth (12000 tokens = 120 credits, 25% = 30 credits)
      const result = await chargeTokensFromCredits(TEST_DOMAIN, 12000)

      expect(result).toBeNull()

      // Balance should remain at 5
      const balance = await getOrgCredits(TEST_DOMAIN)
      expect(balance).toBe(5)

      // Reset for other tests
      await updateOrgCredits(TEST_DOMAIN, INITIAL_CREDITS)
    })
  })

  describe("Supabase persistence", () => {
    test("should persist credits across reads", async () => {
      // Charge once
      await chargeTokensFromCredits(TEST_DOMAIN, 1000)
      const balance1 = await getOrgCredits(TEST_DOMAIN)

      // Read again
      const balance2 = await getOrgCredits(TEST_DOMAIN)

      // Should be the same
      expect(balance1).toBe(balance2)

      // Reset for other tests
      await updateOrgCredits(TEST_DOMAIN, INITIAL_CREDITS)
    })

    test("should update updated_at timestamp in orgs table", async () => {
      const iam = createTestIamClient()

      const { data: before } = await iam.from("orgs").select("updated_at").eq("org_id", TEST_ORG_ID).single()

      // Wait to ensure timestamp difference (PostgreSQL has millisecond precision)
      await new Promise(resolve => setTimeout(resolve, 100))
      await chargeTokensFromCredits(TEST_DOMAIN, 500)

      const { data: after } = await iam.from("orgs").select("updated_at").eq("org_id", TEST_ORG_ID).single()

      if (before && after) {
        const beforeTime = new Date(before.updated_at!).getTime()
        const afterTime = new Date(after.updated_at!).getTime()
        expect(afterTime).toBeGreaterThan(beforeTime)
      }

      // Reset for other tests
      await updateOrgCredits(TEST_DOMAIN, INITIAL_CREDITS)
    })
  })

  describe("updateOrgCredits()", () => {
    test("should update org credits via domain", async () => {
      const newCredits = 250
      const success = await updateOrgCredits(TEST_DOMAIN, newCredits)

      expect(success).toBe(true)

      const balance = await getOrgCredits(TEST_DOMAIN)
      expect(balance).toBe(newCredits)

      // Reset for other tests
      await updateOrgCredits(TEST_DOMAIN, INITIAL_CREDITS)
    })

    test("should return false for non-existent domain", async () => {
      const success = await updateOrgCredits("non-existent.com", 100)
      expect(success).toBe(false)
    })
  })
})
