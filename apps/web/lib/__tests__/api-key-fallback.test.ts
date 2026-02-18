import { describe, expect, it } from "vitest"
import { calculateLLMTokenCost, type LLMTokenUsage, type TokenSource } from "@/lib/tokens"

/**
 * Billing source selection for chat requests.
 *
 * Auth is OAuth-only (no request/body API key fallback).
 * Billing still chooses between workspace credits and user_provided (OAuth/no-credit path).
 */
describe("Auth/Billing source selection", () => {
  const COST_ESTIMATE = 100

  function selectTokenSource(
    workspaceTokens: number,
    oauthAvailable: boolean,
  ): { source: TokenSource | null; shouldDeduct: boolean; statusCode: number } {
    if (workspaceTokens < COST_ESTIMATE && !oauthAvailable) {
      return { source: null, shouldDeduct: false, statusCode: 402 }
    }

    const source: TokenSource = workspaceTokens >= COST_ESTIMATE ? "workspace" : "user_provided"
    return { source, shouldDeduct: source === "workspace", statusCode: 200 }
  }

  describe("Token cost calculation", () => {
    it("sums input + output tokens", () => {
      const usage: LLMTokenUsage = { input_tokens: 50, output_tokens: 75 }
      expect(calculateLLMTokenCost(usage)).toBe(125)
    })

    it("ignores cache token counters", () => {
      const usage: LLMTokenUsage = {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 200,
        cache_read_input_tokens: 150,
      }
      expect(calculateLLMTokenCost(usage)).toBe(150)
    })
  })

  describe("Source selection", () => {
    it("uses workspace when workspace credits are sufficient", () => {
      const result = selectTokenSource(200, true)
      expect(result).toEqual({ source: "workspace", shouldDeduct: true, statusCode: 200 })
    })

    it("uses OAuth/no-credit path when workspace credits are low", () => {
      const result = selectTokenSource(50, true)
      expect(result).toEqual({ source: "user_provided", shouldDeduct: false, statusCode: 200 })
    })

    it("rejects with 402 when workspace credits are low and OAuth is unavailable", () => {
      const result = selectTokenSource(50, false)
      expect(result).toEqual({ source: null, shouldDeduct: false, statusCode: 402 })
    })

    it("treats threshold as workspace-funded", () => {
      const result = selectTokenSource(100, true)
      expect(result.source).toBe("workspace")
      expect(result.shouldDeduct).toBe(true)
    })
  })
})
