/**
 * Tests for safe secret rotation with instance awareness
 */

import { describe, expect, it, beforeEach } from "vitest"
import { createOAuthManager, type OAuthManagerConfig } from "../src"
import type { OAuthTokens } from "../src/types"

describe("Secret Rotation Safety", () => {
  let manager: ReturnType<typeof createOAuthManager>
  const testUserId = `test-user-${Date.now()}`

  beforeEach(() => {
    const config: OAuthManagerConfig = {
      provider: "test-provider",
      instanceId: `test:${Date.now()}`,
      namespace: "oauth_tokens",
      environment: "test",
      defaultTtlSeconds: 300, // 5 minutes for tests
    }
    manager = createOAuthManager(config)
  })

  it("should handle sequential rotations safely", async () => {
    const tokens1: OAuthTokens = {
      access_token: "token-1",
      refresh_token: "refresh-1",
      expires_in: 3600,
    }

    const tokens2: OAuthTokens = {
      access_token: "token-2",
      refresh_token: "refresh-2",
      expires_in: 3600,
    }

    // Save first token
    await manager.saveTokens(testUserId, "github", tokens1)
    const token1 = await manager.getAccessToken(testUserId, "github")
    expect(token1).toBe("token-1")

    // Rotate to second token
    await manager.saveTokens(testUserId, "github", tokens2)
    const token2 = await manager.getAccessToken(testUserId, "github")
    expect(token2).toBe("token-2")

    // Verify we can still read the current token
    const tokenFinal = await manager.getAccessToken(testUserId, "github")
    expect(tokenFinal).toBe("token-2")
  })

  it("should handle concurrent rotations with unique constraint", async () => {
    const promises: Promise<void>[] = []

    // Launch multiple concurrent rotations
    for (let i = 0; i < 5; i++) {
      const tokens: OAuthTokens = {
        access_token: `concurrent-token-${i}`,
        refresh_token: `concurrent-refresh-${i}`,
        expires_in: 3600,
      }

      promises.push(
        manager.saveTokens(testUserId, "linear", tokens).catch(error => {
          // Expected: some may fail with concurrent rotation error
          expect(error.message).toMatch(/Concurrent rotation detected|Save failed/)
          throw error
        }),
      )
    }

    // Wait for all to complete (some may fail)
    const results = await Promise.allSettled(promises)

    const succeeded = results.filter(r => r.status === "fulfilled")
    const failed = results.filter(r => r.status === "rejected")

    // At least one should succeed
    expect(succeeded.length).toBeGreaterThanOrEqual(1)

    // Log for debugging
    console.log(`Concurrent rotation test: ${succeeded.length} succeeded, ${failed.length} failed`)

    // Verify we can read a token (exactly one should be current)
    const finalToken = await manager.getAccessToken(testUserId, "linear")
    expect(finalToken).toMatch(/^concurrent-token-\d+$/)
  })

  it("should maintain at least one current secret during rotation", async () => {
    const tokens: OAuthTokens = {
      access_token: "initial-token",
      refresh_token: "initial-refresh",
      expires_in: 3600,
    }

    // Save initial token
    await manager.saveTokens(testUserId, "slack", tokens)

    // Start reading in a loop while rotating
    let readErrors = 0
    let successfulReads = 0
    let reading = true

    // Background reader - must be awaited before assertions
    const readerPromise = (async () => {
      while (reading) {
        try {
          const token = await manager.getAccessToken(testUserId, "slack")
          expect(token).toBeTruthy() // Should always get a token
          successfulReads++
        } catch (error) {
          readErrors++
          console.error("Read failed during rotation:", error)
        }
        // Small delay between reads
        await new Promise(resolve => setTimeout(resolve, 10))
      }
    })()

    // Perform multiple rotations
    for (let i = 0; i < 3; i++) {
      const newTokens: OAuthTokens = {
        access_token: `rotated-token-${i}`,
        refresh_token: `rotated-refresh-${i}`,
        expires_in: 3600,
      }
      await manager.saveTokens(testUserId, "slack", newTokens)
      // Small delay between rotations
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    // Allow final reads to complete
    await new Promise(resolve => setTimeout(resolve, 100))

    // Stop the reader loop and wait for it to exit
    reading = false
    await readerPromise

    // No reads should have failed
    expect(readErrors).toBe(0)
    expect(successfulReads).toBeGreaterThan(0)

    console.log(`Reads during rotation: ${successfulReads} successful, ${readErrors} errors`)
  })

  it("should respect instance isolation during rotation", async () => {
    // Create two managers with different instance IDs
    const manager1 = createOAuthManager({
      provider: "github",
      instanceId: "github:prod:tenant-1",
      namespace: "oauth_connections",
      environment: "prod",
    })

    const manager2 = createOAuthManager({
      provider: "github",
      instanceId: "github:prod:tenant-2",
      namespace: "oauth_connections",
      environment: "prod",
    })

    const tokens1: OAuthTokens = {
      access_token: "tenant1-token",
      refresh_token: "tenant1-refresh",
    }

    const tokens2: OAuthTokens = {
      access_token: "tenant2-token",
      refresh_token: "tenant2-refresh",
    }

    // Same user, same provider, different instances
    await manager1.saveTokens(testUserId, "github", tokens1)
    await manager2.saveTokens(testUserId, "github", tokens2)

    // Each instance should have its own token
    const token1 = await manager1.getAccessToken(testUserId, "github")
    const token2 = await manager2.getAccessToken(testUserId, "github")

    expect(token1).toBe("tenant1-token")
    expect(token2).toBe("tenant2-token")

    // Rotating one shouldn't affect the other
    const rotatedTokens1: OAuthTokens = {
      access_token: "tenant1-rotated",
      refresh_token: "tenant1-refresh-rotated",
    }

    await manager1.saveTokens(testUserId, "github", rotatedTokens1)

    // Check isolation is maintained
    const newToken1 = await manager1.getAccessToken(testUserId, "github")
    const stillToken2 = await manager2.getAccessToken(testUserId, "github")

    expect(newToken1).toBe("tenant1-rotated")
    expect(stillToken2).toBe("tenant2-token") // Unchanged
  })
})
