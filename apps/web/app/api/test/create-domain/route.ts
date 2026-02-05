/**
 * Create Domain for E2E Testing
 *
 * Creates a domain entry in app.domains without actual deployment.
 * Only accessible in test environments.
 * Used to set up test scenarios (e.g., testing site limits).
 */

import { structuredErrorResponse } from "@/lib/api/responses"
import { ErrorCodes } from "@/lib/error-codes"
import { createAppClient } from "@/lib/supabase/app"

interface CreateDomainRequest {
  hostname: string
  orgId: string
  port: number
}

export async function POST(req: Request) {
  // Environment guard - only accessible in test/local environments or with test secret
  const isTestEnv = process.env.NODE_ENV === "test" || process.env.STREAM_ENV === "local"
  const testSecret = req.headers.get("x-test-secret")
  const expectedSecret = process.env.E2E_TEST_SECRET
  const hasValidSecret = expectedSecret && testSecret === expectedSecret

  if (!isTestEnv && !hasValidSecret) {
    return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 404 })
  }

  const body = (await req.json()) as CreateDomainRequest
  const { hostname, orgId, port } = body

  if (!hostname || !orgId || !port) {
    return structuredErrorResponse(ErrorCodes.VALIDATION_ERROR, {
      status: 400,
      details: { message: "Missing required fields: hostname, orgId, port" },
    })
  }

  const app = await createAppClient("service")

  // Create domain entry (test environment only, no actual deployment)
  const { error: domainError } = await app.from("domains").upsert(
    {
      hostname,
      org_id: orgId,
      port,
      is_test_env: true,
      test_run_id: process.env.E2E_RUN_ID || `manual-${Date.now()}`,
    },
    {
      onConflict: "hostname",
    },
  )

  if (domainError) {
    console.error("[Test Create Domain] Failed:", domainError)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, {
      status: 500,
      details: { message: domainError.message },
    })
  }

  return Response.json({
    ok: true,
    hostname,
    orgId,
    port,
  })
}

/**
 * DELETE - Clean up test domain
 */
export async function DELETE(req: Request) {
  // Same environment guard
  const isTestEnv = process.env.NODE_ENV === "test" || process.env.STREAM_ENV === "local"
  const testSecret = req.headers.get("x-test-secret")
  const expectedSecret = process.env.E2E_TEST_SECRET
  const hasValidSecret = expectedSecret && testSecret === expectedSecret

  if (!isTestEnv && !hasValidSecret) {
    return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 404 })
  }

  const { searchParams } = new URL(req.url)
  const hostname = searchParams.get("hostname")

  if (!hostname) {
    return structuredErrorResponse(ErrorCodes.VALIDATION_ERROR, {
      status: 400,
      details: { message: "Missing hostname parameter" },
    })
  }

  const app = await createAppClient("service")

  const { error } = await app.from("domains").delete().eq("hostname", hostname).eq("is_test_env", true)

  if (error) {
    console.error("[Test Delete Domain] Failed:", error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, {
      status: 500,
      details: { message: error.message },
    })
  }

  return Response.json({
    ok: true,
    deleted: hostname,
  })
}
