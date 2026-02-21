/**
 * Verify Tenant Readiness for E2E Tests
 *
 * Checks if tenant has been fully created and is ready for testing.
 * Used by global-setup.ts to poll for database consistency.
 * Only accessible in test environments.
 */

import * as Sentry from "@sentry/nextjs"
import { env } from "@webalive/env/server"
import { TEST_CONFIG } from "@webalive/shared"
import { structuredErrorResponse } from "@/lib/api/responses"
import { ErrorCodes } from "@/lib/error-codes"
import { createAppClient } from "@/lib/supabase/app"
import { createIamClient } from "@/lib/supabase/iam"

type TenantCheck = "user" | "membership" | "org" | "domain"

interface PostgrestErrorLike {
  code?: string
  message?: string
}

function asPostgrestError(error: unknown): PostgrestErrorLike | null {
  if (error && typeof error === "object") {
    return error as PostgrestErrorLike
  }
  return null
}

function isNoRowsError(error: unknown): boolean {
  return asPostgrestError(error)?.code === "PGRST116"
}

function createQueryErrorResponse(check: TenantCheck, error: unknown): Response {
  const dbError = asPostgrestError(error)
  return Response.json(
    {
      ready: false,
      reason: "query_error",
      check,
      code: dbError?.code ?? "unknown",
      message: dbError?.message ?? "Database query failed",
    },
    { status: 503 },
  )
}

export async function GET(req: Request) {
  // Environment guard - accessible in test/local environments OR with valid test secret
  const isTestEnv = env.NODE_ENV === "test" || env.STREAM_ENV === "local"

  // Check for test secret header (for staging/production E2E tests)
  const testSecret = req.headers.get("x-test-secret")
  const expectedSecret = env.E2E_TEST_SECRET
  const hasValidSecret = expectedSecret && testSecret === expectedSecret

  if (!isTestEnv && !hasValidSecret) {
    return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 404 })
  }

  const { searchParams } = new URL(req.url)
  const email = searchParams.get("email")

  if (!email) {
    return structuredErrorResponse(ErrorCodes.VALIDATION_ERROR, { status: 400 })
  }

  try {
    const iam = await createIamClient("service")
    const app = await createAppClient("service")

    // 1. Check if user exists
    const { data: user, error: userError } = await iam.from("users").select("user_id").eq("email", email).single()

    if (userError && !isNoRowsError(userError)) {
      return createQueryErrorResponse("user", userError)
    }

    if (!user) {
      return Response.json({ ready: false, missing: "user" })
    }

    // 2. Check if user has at least one org membership
    // Note: Use limit(1) instead of single() because test users may have accumulated
    // multiple memberships from repeated test runs (bootstrap creates new orgs each time)
    const { data: memberships, error: membershipError } = await iam
      .from("org_memberships")
      .select("org_id")
      .eq("user_id", user.user_id)
      .limit(1)

    if (membershipError) {
      return createQueryErrorResponse("membership", membershipError)
    }

    const membership = memberships?.[0]
    if (!membership) {
      return Response.json({ ready: false, missing: "membership" })
    }

    // 3. Check if org has credits
    const { data: org, error: orgError } = await iam
      .from("orgs")
      .select("credits")
      .eq("org_id", membership.org_id)
      .single()

    if (orgError && !isNoRowsError(orgError)) {
      return createQueryErrorResponse("org", orgError)
    }

    if (!org || org.credits < 0) {
      return Response.json({ ready: false, missing: "org" })
    }

    // 4. Check if domain exists (extract workspace from email pattern)
    // Email format is e2e_w{N}@alive.local (TEST_CONFIG.WORKER_EMAIL_PREFIX = "e2e_w")
    const workerIndex = email.match(/e2e_w(\d+)@/)?.[1]
    if (workerIndex !== undefined) {
      const workspace = `${TEST_CONFIG.WORKSPACE_PREFIX}${workerIndex}.${TEST_CONFIG.EMAIL_DOMAIN}`
      // Use limit(1) instead of single() - we just need to verify at least one domain exists
      // The domain might be associated with any of the user's orgs (from accumulated test runs)
      const { data: domains, error: domainError } = await app
        .from("domains")
        .select("hostname")
        .eq("hostname", workspace)
        .limit(1)

      if (domainError) {
        return createQueryErrorResponse("domain", domainError)
      }

      if (!domains || domains.length === 0) {
        return Response.json({ ready: false, missing: "domain" })
      }
    }

    // All checks passed
    return Response.json({ ready: true })
  } catch (error) {
    console.error("[Verify Tenant] Error:", error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}
