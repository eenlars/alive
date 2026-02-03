import { env } from "@webalive/env/server"
import { importJWK, jwtVerify, SignJWT } from "jose"
import {
  JsonWebTokenError,
  type Secret,
  sign as signHS256,
  TokenExpiredError,
  verify as verifyHS256,
} from "jsonwebtoken"

/**
 * JWT Configuration - Lazy Initialization
 *
 * This module uses lazy initialization to avoid top-level validation errors during build.
 * Validation occurs on first use, not on module import.
 */

// Configuration type
type JwtConfig = {
  secret: Secret
  es256Enabled: boolean
  es256PrivateKey: any
  es256Kid: string | null
}

// Configuration state
let jwtConfig: JwtConfig | null = null

// Promise-based lock to prevent race conditions during initialization
let jwtConfigPromise: Promise<JwtConfig> | null = null

/**
 * Initialize JWT configuration with lazy validation
 * This runs on first use, not during module import
 * Thread-safe: concurrent calls will wait for the first initialization to complete
 */
async function getJwtConfig() {
  // Fast path: already initialized
  if (jwtConfig) {
    return jwtConfig
  }

  // Wait for in-progress initialization
  if (jwtConfigPromise) {
    return jwtConfigPromise
  }

  // Start initialization (only one caller will reach here)
  jwtConfigPromise = (async () => {
    try {
      const JWT_SECRET: Secret = env.JWT_SECRET || "INSECURE_DEV_SECRET_CHANGE_IN_PRODUCTION"
      const ES256_ENABLED = env.JWT_ALGORITHM === "ES256"
      let ES256_PRIVATE_KEY_DATA: any = null
      let ES256_KID: string | null = null

      // Validate ES256 configuration if enabled
      if (ES256_ENABLED) {
        const privateKeyEnv = env.JWT_ES256_PRIVATE_KEY

        if (!privateKeyEnv) {
          throw new Error(
            "⚠️  CRITICAL SECURITY ERROR: JWT_ES256_PRIVATE_KEY environment variable must be set when using ES256!\n" +
              "This should contain the JSON Web Key (JWK) as a JSON string.\n" +
              "Never commit private keys to version control.",
          )
        }

        try {
          ES256_PRIVATE_KEY_DATA = JSON.parse(privateKeyEnv)
          ES256_KID = ES256_PRIVATE_KEY_DATA.kid

          if (!ES256_KID) {
            throw new Error("Private key JWK must have a 'kid' (key ID) field")
          }

          console.log(`[JWT] ES256 signing enabled with key ID: ${ES256_KID}`)
        } catch (error) {
          console.error("[JWT] Failed to parse ES256 private key:", error)
          throw new Error("JWT_ES256_PRIVATE_KEY must be valid JWK JSON")
        }
      }

      // Validate HS256 configuration in production
      // This now runs lazily instead of at module load time
      if (
        !ES256_ENABLED &&
        env.NODE_ENV === "production" &&
        JWT_SECRET === "INSECURE_DEV_SECRET_CHANGE_IN_PRODUCTION"
      ) {
        throw new Error(
          "⚠️  CRITICAL SECURITY ERROR: JWT_SECRET environment variable must be set in production!\n" +
            "Generate a secure secret with: openssl rand -base64 32\n" +
            "Then set JWT_SECRET in your environment.\n" +
            "Or set JWT_ALGORITHM=ES256 to use asymmetric signing.",
        )
      }

      // Cache the configuration
      jwtConfig = {
        secret: JWT_SECRET,
        es256Enabled: ES256_ENABLED,
        es256PrivateKey: ES256_PRIVATE_KEY_DATA,
        es256Kid: ES256_KID,
      }

      return jwtConfig
    } finally {
      // Clear the promise so future calls use the fast path
      jwtConfigPromise = null
    }
  })()

  return jwtConfigPromise
}

export interface SessionPayload {
  sub: string // Standard JWT claim for user ID (required for RLS)
  userId: string // Legacy claim (backward compatibility)
  email: string // User email (eliminates iam.users query)
  name: string | null // Display name (eliminates iam.users query)
  workspaces: string[] // Authorized domain hostnames (eliminates org_memberships + domains queries)
  iat?: number
  exp?: number
  [key: string]: unknown // Index signature for JWTPayload compatibility
}

/**
 * Create a signed JWT token for authenticated user
 * Token expires in 30 days
 *
 * @param userId - User ID (must be a valid UUID)
 * @param email - User email
 * @param name - User display name (nullable)
 * @param workspaces - Authorized domain hostnames (workspace access list)
 * @returns Signed JWT token
 * @throws Error if userId is invalid
 *
 * NOTE: Embeds user profile + workspace access to eliminate database queries on every request.
 * Includes both 'sub' (standard JWT claim for Supabase RLS) and 'userId' (backward compatibility).
 */
export async function createSessionToken(
  userId: string,
  email: string,
  name: string | null,
  workspaces: string[],
): Promise<string> {
  // Lazy load JWT configuration (validates env vars on first use)
  const config = await getJwtConfig()

  // Security: Validate userId before creating token
  if (!userId || typeof userId !== "string") {
    throw new Error("[JWT] userId must be a non-empty string")
  }

  if (userId.trim() === "") {
    throw new Error("[JWT] userId cannot be empty or whitespace")
  }

  // Security: Detect malicious patterns
  if (userId.includes("'") || userId.includes('"') || userId.includes("--") || userId.includes(";")) {
    throw new Error("[JWT] userId contains invalid characters (potential SQL injection)")
  }

  if (userId.includes("..") || userId.includes("/") || userId.includes("\\")) {
    throw new Error("[JWT] userId contains invalid characters (potential path traversal)")
  }

  // Security: Validate email
  if (!email || typeof email !== "string" || email.trim() === "") {
    throw new Error("[JWT] email must be a non-empty string")
  }

  // Security: Validate workspaces array
  if (!Array.isArray(workspaces)) {
    throw new Error("[JWT] workspaces must be an array")
  }

  const payload: SessionPayload = {
    sub: userId, // Standard JWT claim (used by RLS policies)
    userId: userId, // Legacy claim (backward compatibility)
    email: email,
    name: name,
    workspaces: workspaces,
  }

  // Use ES256 if enabled, otherwise fall back to HS256
  if (config.es256Enabled) {
    const privateKey = await importJWK(config.es256PrivateKey, "ES256")

    return await new SignJWT(payload)
      .setProtectedHeader({
        alg: "ES256",
        kid: config.es256Kid!,
        typ: "JWT",
      })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(privateKey)
  } else {
    return signHS256(payload, config.secret, { expiresIn: "30d" })
  }
}

/**
 * Verify and decode a session JWT token
 * Supports both ES256 (new) and HS256 (legacy) tokens
 * @param token - JWT token to verify
 * @returns SessionPayload if valid, null if invalid/expired
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    // Lazy load JWT configuration (validates env vars on first use)
    const config = await getJwtConfig()

    if (!token || typeof token !== "string" || token.trim() === "") {
      return null
    }

    let decoded: SessionPayload

    // Try ES256 verification first (if enabled)
    if (config.es256Enabled) {
      try {
        // For verification, extract public key from JWK (remove 'd' parameter)
        const publicKeyJWK = { ...config.es256PrivateKey }
        delete publicKeyJWK.d
        const publicKey = await importJWK(publicKeyJWK, "ES256")

        const { payload } = await jwtVerify(token, publicKey, {
          algorithms: ["ES256"],
        })
        decoded = payload as SessionPayload
      } catch (_es256Error) {
        // If ES256 fails, try HS256 (for backward compatibility)
        decoded = verifyHS256(token, config.secret) as SessionPayload
      }
    } else {
      // HS256 mode only
      decoded = verifyHS256(token, config.secret) as SessionPayload
    }

    // Extract user ID from either 'sub' or 'userId' (backward compatibility)
    const sub = decoded.sub
    const userId = decoded.userId

    // Security: Both must be present and valid, OR one is present and we backfill
    const extractedUserId = sub || userId

    if (!extractedUserId || typeof extractedUserId !== "string" || extractedUserId.trim() === "") {
      console.error("[JWT] Invalid token payload: sub/userId missing or invalid")
      return null
    }

    // Security: If both present, they must match (corruption detection)
    if (sub && userId && sub !== userId) {
      console.error("[JWT] Token corruption detected: sub and userId mismatch")
      return null
    }

    // Extract and validate required fields (email, name, workspaces)
    const email = decoded.email
    const name = decoded.name ?? null
    const workspaces = decoded.workspaces

    // Security: Validate email is present and valid (REQUIRED - no backward compatibility)
    if (!email || typeof email !== "string" || email.trim() === "") {
      console.error("[JWT] Invalid token payload: email missing or invalid (old token - re-login required)")
      return null
    }

    // Security: Validate workspaces is an array (REQUIRED - no backward compatibility)
    if (!Array.isArray(workspaces)) {
      console.error("[JWT] Invalid token payload: workspaces must be an array (old token - re-login required)")
      return null
    }

    // Return payload with all required fields
    return {
      ...decoded,
      sub: sub || userId,
      userId: userId || sub,
      email: email,
      name: name,
      workspaces: workspaces,
    }
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      console.log("[JWT] Token expired")
    } else if (error instanceof JsonWebTokenError) {
      console.error("[JWT] Invalid token:", (error as Error).message)
    } else {
      console.error("[JWT] Token verification failed:", error)
    }
    return null
  }
}
