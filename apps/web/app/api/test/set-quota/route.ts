/**
 * Set User Quota for E2E Testing
 *
 * Sets or updates the max_sites quota for a user.
 * Only accessible in test environments.
 */

import { structuredErrorResponse } from "@/lib/api/responses"
import { ErrorCodes } from "@/lib/error-codes"
import { createAppClient } from "@/lib/supabase/app"
import { createIamClient } from "@/lib/supabase/iam"

interface SetQuotaRequest {
  email: string
  maxSites: number
}

export async function POST(req: Request) {
  // Environment guard - return 404 to hide endpoint existence
  const isTestEnv = process.env.NODE_ENV === "test" || process.env.BRIDGE_ENV === "local"
  const testSecret = req.headers.get("x-test-secret")
  const expectedSecret = process.env.E2E_TEST_SECRET
  const hasValidSecret = expectedSecret && testSecret === expectedSecret

  if (!isTestEnv && !hasValidSecret) {
    return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 404 })
  }

  const body = (await req.json()) as SetQuotaRequest
  const { email, maxSites } = body

  if (!email || typeof maxSites !== "number" || maxSites < 0) {
    return structuredErrorResponse(ErrorCodes.VALIDATION_ERROR, {
      status: 400,
      details: { message: "Missing or invalid fields: email (string), maxSites (non-negative number)" },
    })
  }

  const iam = await createIamClient("service")
  const app = await createAppClient("service")

  // Look up user by email
  const { data: user, error: userError } = await iam
    .from("users")
    .select("user_id")
    .eq("email", email.toLowerCase())
    .single()

  if (userError || !user) {
    return structuredErrorResponse(ErrorCodes.USER_NOT_FOUND, {
      status: 404,
      details: { email },
    })
  }

  // Upsert quota
  const { error: quotaError } = await app.from("user_quotas").upsert(
    {
      user_id: user.user_id,
      max_sites: maxSites,
    },
    {
      onConflict: "user_id",
    },
  )

  if (quotaError) {
    console.error("[Test Set Quota] Failed:", quotaError)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, {
      status: 500,
      details: { message: quotaError.message },
    })
  }

  return Response.json({
    ok: true,
    email,
    maxSites,
    userId: user.user_id,
  })
}
