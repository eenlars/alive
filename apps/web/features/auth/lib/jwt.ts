import { env } from "@webalive/env/server"
import { isOrgRole, ORG_ROLES, type OrgRole, type OrgRoleMap } from "@webalive/shared"
import { importJWK, jwtVerify, SignJWT } from "jose"
import type { Secret } from "jsonwebtoken"
import jwt from "jsonwebtoken"

const { JsonWebTokenError, TokenExpiredError, sign: signHS256, verify: verifyHS256 } = jwt

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

export const SESSION_SCOPES = {
  WORKSPACE_ACCESS: "workspace:access",
  WORKSPACE_LIST: "workspace:list",
  ORG_READ: "org:read",
  MANAGER_ACCESS: "manager:access",
} as const

export type SessionScope = (typeof SESSION_SCOPES)[keyof typeof SESSION_SCOPES]
export const SESSION_ORG_ROLES = ORG_ROLES
export type SessionOrgRole = OrgRole
export type SessionOrgRoles = OrgRoleMap

export const DEFAULT_USER_SCOPES: SessionScope[] = [
  SESSION_SCOPES.WORKSPACE_ACCESS,
  SESSION_SCOPES.WORKSPACE_LIST,
  SESSION_SCOPES.ORG_READ,
]

function isValidScope(scope: unknown): scope is SessionScope {
  return Object.values(SESSION_SCOPES).includes(scope as SessionScope)
}

export function isSessionOrgRole(role: unknown): role is SessionOrgRole {
  return isOrgRole(role)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function normalizeScopes(scopes: SessionScope[] | undefined): SessionScope[] {
  const source = scopes && scopes.length > 0 ? scopes : DEFAULT_USER_SCOPES
  return [...new Set(source)]
}

export interface SessionPayloadV3 {
  role: "authenticated" // PostgREST role switch for Supabase RLS
  sub: string // Standard JWT claim for user ID (required for RLS)
  userId: string // Legacy claim (backward compatibility)
  email: string // User email (eliminates iam.users query)
  name: string | null // Display name (eliminates iam.users query)
  scopes: SessionScope[]
  orgIds: string[]
  orgRoles: SessionOrgRoles
  iat?: number
  exp?: number
  [key: string]: unknown // Index signature for JWTPayload compatibility
}

export interface CreateSessionTokenInput {
  userId: string
  email: string
  name: string | null
  scopes?: SessionScope[]
  orgIds?: string[]
  orgRoles?: SessionOrgRoles
}

/**
 * Create a signed JWT token for authenticated user
 * Token expires in 30 days
 *
 * @param input - JWT payload input for session claims
 * @returns Signed JWT token
 * @throws Error if userId is invalid
 *
 * NOTE: Embeds user profile + org access metadata.
 * Includes both 'sub' (standard JWT claim for Supabase RLS) and 'userId' (backward compatibility).
 */
export async function createSessionToken(input: CreateSessionTokenInput): Promise<string> {
  // Lazy load JWT configuration (validates env vars on first use)
  const config = await getJwtConfig()
  const { userId, email, name } = input
  const scopes = normalizeScopes(input.scopes)
  const orgIds = [...new Set(input.orgIds ?? [])]
  const orgRoles = input.orgRoles ?? {}

  // Security: Validate userId before creating token
  if (!isNonEmptyString(userId)) {
    throw new Error("[JWT] userId must be a non-empty string")
  }

  // Security: Detect malicious patterns
  if (userId.includes("'") || userId.includes('"') || userId.includes("--") || userId.includes(";")) {
    throw new Error("[JWT] userId contains invalid characters (potential SQL injection)")
  }

  if (userId.includes("..") || userId.includes("/") || userId.includes("\\")) {
    throw new Error("[JWT] userId contains invalid characters (potential path traversal)")
  }

  // Security: Validate email
  if (!isNonEmptyString(email)) {
    throw new Error("[JWT] email must be a non-empty string")
  }

  if (!Array.isArray(scopes) || scopes.length === 0 || !scopes.every(isValidScope)) {
    throw new Error("[JWT] scopes must be a non-empty array of valid session scopes")
  }

  if (!Array.isArray(orgIds) || !orgIds.every(isNonEmptyString)) {
    throw new Error("[JWT] orgIds must be an array of non-empty strings")
  }

  if (!orgRoles || typeof orgRoles !== "object" || Array.isArray(orgRoles)) {
    throw new Error("[JWT] orgRoles must be an object")
  }

  const roleEntries = Object.entries(orgRoles)
  for (const [orgId, role] of roleEntries) {
    if (!isNonEmptyString(orgId) || !isSessionOrgRole(role)) {
      throw new Error("[JWT] orgRoles must map org IDs to valid roles")
    }
  }

  for (const orgId of orgIds) {
    if (!orgRoles[orgId]) {
      throw new Error("[JWT] orgRoles must include every orgId")
    }
  }

  for (const orgId of Object.keys(orgRoles)) {
    if (!orgIds.includes(orgId)) {
      throw new Error("[JWT] orgRoles contains org not present in orgIds")
    }
  }

  const payload: SessionPayloadV3 = {
    role: "authenticated",
    sub: userId, // Standard JWT claim (used by RLS policies)
    userId: userId, // Legacy claim (backward compatibility)
    email: email,
    name: name,
    scopes,
    orgIds,
    orgRoles,
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
 * Verify and decode a session JWT token.
 * Enforces strict SessionPayloadV3 shape (no legacy fallback claims).
 * @param token - JWT token to verify
 * @returns SessionPayloadV3 if valid, null if invalid/expired
 */
export async function verifySessionToken(token: string): Promise<SessionPayloadV3 | null> {
  try {
    // Lazy load JWT configuration (validates env vars on first use)
    const config = await getJwtConfig()

    if (!token || typeof token !== "string" || token.trim() === "") {
      return null
    }

    let decoded: Record<string, unknown>

    // Verify with the currently configured algorithm only.
    if (config.es256Enabled) {
      // For verification, extract public key from JWK (remove 'd' parameter)
      const publicKeyJWK = { ...config.es256PrivateKey }
      delete publicKeyJWK.d
      const publicKey = await importJWK(publicKeyJWK, "ES256")

      const { payload } = await jwtVerify(token, publicKey, {
        algorithms: ["ES256"],
      })
      if (!isRecord(payload)) {
        return null
      }
      decoded = payload
    } else {
      // HS256 mode only
      const hsPayload = verifyHS256(token, config.secret)
      if (!isRecord(hsPayload)) {
        return null
      }
      decoded = hsPayload
    }

    // Strict v3 claim requirements: both sub and userId must be present and match.
    const sub = decoded.sub
    const userId = decoded.userId

    if (!isNonEmptyString(sub)) {
      console.error("[JWT] Invalid token payload: sub missing or invalid")
      return null
    }

    if (!isNonEmptyString(userId)) {
      console.error("[JWT] Invalid token payload: userId missing or invalid")
      return null
    }

    if (sub !== userId) {
      console.error("[JWT] Token corruption detected: sub and userId mismatch")
      return null
    }

    // Extract and validate required fields
    const role = decoded.role
    const email = decoded.email
    const name = decoded.name ?? null
    const scopes = decoded.scopes
    const orgIds = decoded.orgIds
    const orgRoles = decoded.orgRoles

    if (role !== "authenticated") {
      console.error("[JWT] Invalid token payload: role must be 'authenticated'")
      return null
    }

    if (!isNonEmptyString(email)) {
      console.error("[JWT] Invalid token payload: email missing or invalid")
      return null
    }

    if (!Array.isArray(scopes) || scopes.length === 0 || !scopes.every(isValidScope)) {
      console.error("[JWT] Invalid token payload: scopes must be a non-empty array of valid scope strings")
      return null
    }

    if (!Array.isArray(orgIds) || !orgIds.every(isNonEmptyString)) {
      console.error("[JWT] Invalid token payload: orgIds must be an array of non-empty strings")
      return null
    }

    if (!orgRoles || typeof orgRoles !== "object" || Array.isArray(orgRoles)) {
      console.error("[JWT] Invalid token payload: orgRoles must be an object")
      return null
    }

    const normalizedOrgRoles: SessionOrgRoles = {}
    for (const [orgId, role] of Object.entries(orgRoles)) {
      if (!isNonEmptyString(orgId) || !isSessionOrgRole(role)) {
        console.error("[JWT] Invalid token payload: orgRoles must map org IDs to valid roles")
        return null
      }
      normalizedOrgRoles[orgId] = role
    }

    for (const orgId of orgIds) {
      if (!normalizedOrgRoles[orgId]) {
        console.error("[JWT] Invalid token payload: orgRoles missing role for orgId")
        return null
      }
    }

    for (const orgId of Object.keys(normalizedOrgRoles)) {
      if (!orgIds.includes(orgId)) {
        console.error("[JWT] Invalid token payload: orgRoles has org not listed in orgIds")
        return null
      }
    }

    if (name !== null && typeof name !== "string") {
      console.error("[JWT] Invalid token payload: name must be a string or null")
      return null
    }

    return {
      ...decoded,
      role: "authenticated",
      sub,
      userId,
      email: email,
      name: name,
      scopes: [...new Set(scopes)],
      orgIds: [...new Set(orgIds)],
      orgRoles: normalizedOrgRoles,
    }
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      console.log("[JWT] Token expired")
    } else if (error instanceof JsonWebTokenError) {
      console.error("[JWT] Invalid token:", error.message)
    } else {
      console.error("[JWT] Token verification failed:", error)
    }
    return null
  }
}
