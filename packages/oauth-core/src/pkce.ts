/**
 * PKCE (Proof Key for Code Exchange) Support
 *
 * Implements RFC 7636 for public OAuth2 clients
 * https://www.rfc-editor.org/rfc/rfc7636.html
 *
 * Learned from n8n's implementation:
 * - PKCE is required for public clients (no client_secret)
 * - S256 challenge method is preferred over plain
 * - code_verifier must be cryptographically random
 */

import { createHash, randomBytes } from "node:crypto"

export interface PKCEChallenge {
  code_verifier: string
  code_challenge: string
  code_challenge_method: "S256" | "plain"
}

/**
 * Generates a PKCE challenge pair
 *
 * @returns code_verifier and code_challenge for OAuth2 PKCE flow
 */
export function generatePKCEChallenge(): PKCEChallenge {
  // RFC 7636: code_verifier is 43-128 characters from unreserved set
  // Using 32 bytes = 43 base64url chars (minimum)
  const code_verifier = randomBytes(32).toString("base64url").replace(/=/g, "") // Remove padding

  // RFC 7636: code_challenge = BASE64URL(SHA256(code_verifier))
  const code_challenge = createHash("sha256").update(code_verifier).digest("base64url").replace(/=/g, "")

  return {
    code_verifier,
    code_challenge,
    code_challenge_method: "S256",
  }
}

/**
 * Verifies a PKCE challenge (for server-side validation)
 *
 * @param code_verifier - The original verifier sent by client
 * @param code_challenge - The challenge sent during authorization
 * @param method - The challenge method used
 * @returns true if verification passes
 */
export function verifyPKCEChallenge(
  code_verifier: string,
  code_challenge: string,
  method: "S256" | "plain" = "S256",
): boolean {
  if (method === "plain") {
    return code_verifier === code_challenge
  }

  const computed = createHash("sha256").update(code_verifier).digest("base64url").replace(/=/g, "")

  return computed === code_challenge
}
