/**
 * Shared preview token utilities
 *
 * Used by:
 * - /api/auth/preview-token (creates tokens)
 * - /api/auth/preview-guard (validates tokens for Caddy forward_auth)
 * - Go preview-proxy (validates tokens via shared JWT_SECRET)
 */

import { env } from "@webalive/env/server"
import { jwtVerify, SignJWT } from "jose"

const PREVIEW_TOKEN_SECRET = new TextEncoder().encode(env.JWT_SECRET || "INSECURE_DEV_SECRET_CHANGE_IN_PRODUCTION")
const PREVIEW_TOKEN_EXPIRY = "5m"

/**
 * Create a short-lived preview token for iframe authentication
 */
export async function createPreviewToken(userId: string): Promise<string> {
  return await new SignJWT({ type: "preview", userId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(PREVIEW_TOKEN_EXPIRY)
    .sign(PREVIEW_TOKEN_SECRET)
}

/**
 * Verify a preview token and return the userId, or null if invalid/expired
 */
export async function verifyPreviewToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, PREVIEW_TOKEN_SECRET, {
      algorithms: ["HS256"],
    })
    if (payload.type === "preview" && typeof payload.userId === "string") {
      return payload.userId
    }
    return null
  } catch {
    return null
  }
}
