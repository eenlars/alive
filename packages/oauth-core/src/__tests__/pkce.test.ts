import { describe, it, expect } from "bun:test"
import { createHash } from "node:crypto"
import { generatePKCEChallenge, verifyPKCEChallenge } from "../pkce"

describe("PKCE", () => {
  describe("generatePKCEChallenge", () => {
    it("generates valid challenge pair", () => {
      const challenge = generatePKCEChallenge()

      expect(challenge.code_verifier).toBeDefined()
      expect(challenge.code_challenge).toBeDefined()
      expect(challenge.code_challenge_method).toBe("S256")

      // Verifier should be 43+ chars (base64url of 32 bytes)
      expect(challenge.code_verifier.length).toBeGreaterThanOrEqual(43)
    })

    it("generates unique challenges each time", () => {
      const c1 = generatePKCEChallenge()
      const c2 = generatePKCEChallenge()

      expect(c1.code_verifier).not.toBe(c2.code_verifier)
      expect(c1.code_challenge).not.toBe(c2.code_challenge)
    })

    it("generates base64url-safe characters only", () => {
      const challenge = generatePKCEChallenge()

      // Base64url uses A-Z, a-z, 0-9, -, _ (no + or / or =)
      const base64urlPattern = /^[A-Za-z0-9_-]+$/
      expect(challenge.code_verifier).toMatch(base64urlPattern)
      expect(challenge.code_challenge).toMatch(base64urlPattern)
    })

    it("challenge is SHA256 hash of verifier", () => {
      const challenge = generatePKCEChallenge()

      // Manually compute expected challenge
      const expectedChallenge = createHash("sha256")
        .update(challenge.code_verifier)
        .digest("base64url")
        .replace(/=/g, "")

      expect(challenge.code_challenge).toBe(expectedChallenge)
    })
  })

  describe("verifyPKCEChallenge", () => {
    it("verifies S256 challenge correctly", () => {
      const challenge = generatePKCEChallenge()

      const isValid = verifyPKCEChallenge(challenge.code_verifier, challenge.code_challenge, "S256")

      expect(isValid).toBe(true)
    })

    it("rejects invalid verifier", () => {
      const challenge = generatePKCEChallenge()

      const isValid = verifyPKCEChallenge("wrong-verifier", challenge.code_challenge, "S256")

      expect(isValid).toBe(false)
    })

    it("rejects tampered challenge", () => {
      const challenge = generatePKCEChallenge()

      const isValid = verifyPKCEChallenge(challenge.code_verifier, "tampered-challenge", "S256")

      expect(isValid).toBe(false)
    })

    it("handles empty verifier", () => {
      const challenge = generatePKCEChallenge()

      const isValid = verifyPKCEChallenge("", challenge.code_challenge, "S256")

      expect(isValid).toBe(false)
    })

    it("handles empty challenge", () => {
      const challenge = generatePKCEChallenge()

      const isValid = verifyPKCEChallenge(challenge.code_verifier, "", "S256")

      expect(isValid).toBe(false)
    })
  })

  describe("PKCE for public vs confidential clients", () => {
    it("generates PKCE suitable for public clients (no client_secret)", () => {
      // Public clients (SPAs, mobile apps) use PKCE as the ONLY security mechanism
      const challenge = generatePKCEChallenge()

      // The challenge must be cryptographically strong
      // 32 bytes of entropy = 256 bits, which is sufficient
      expect(challenge.code_verifier.length).toBeGreaterThanOrEqual(43)
      expect(challenge.code_verifier.length).toBeLessThanOrEqual(128)
    })

    it("verifier can be used in token exchange", () => {
      const challenge = generatePKCEChallenge()

      // Simulate what happens during token exchange:
      // 1. Auth URL includes code_challenge
      // 2. Token request includes code_verifier
      // 3. Server verifies: SHA256(code_verifier) == code_challenge

      const serverSideVerification = createHash("sha256")
        .update(challenge.code_verifier)
        .digest("base64url")
        .replace(/=/g, "")

      expect(serverSideVerification).toBe(challenge.code_challenge)
    })
  })
})
