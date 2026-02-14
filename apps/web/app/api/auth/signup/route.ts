import * as Sentry from "@sentry/nextjs"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createSessionToken } from "@/features/auth/lib/jwt"
import { createCorsResponse, createCorsSuccessResponse } from "@/lib/api/responses"
import { COOKIE_NAMES, getSessionCookieOptions } from "@/lib/auth/cookies"
import { addCorsHeaders } from "@/lib/cors-utils"
import { getUserDefaultOrgId } from "@/lib/deployment/org-resolver"
import { ErrorCodes, getErrorMessage } from "@/lib/error-codes"
import { createIamClient } from "@/lib/supabase/iam"
import { generateRequestId } from "@/lib/utils"
import { hashPassword } from "@/types/guards/api"

const SignupSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(64, "Password must be at most 64 characters"),
  name: z.string().max(100).optional(),
})

export type SignupResponse = {
  ok: true
  userId: string
  email: string
  message: string
}

export type SignupErrorResponse = {
  ok: false
  error: string
  message: string
  requestId: string
}

/**
 * POST /api/auth/signup
 *
 * Create a new user account (separate from deployment).
 * Sets session cookie on success, allowing immediate use of the app.
 *
 * Flow:
 * 1. Validate email/password
 * 2. Check email doesn't exist
 * 3. Create user with hashed password
 * 4. Create default organization
 * 5. Set JWT session cookie
 * 6. Return success
 */
export async function POST(req: NextRequest) {
  const requestId = generateRequestId()
  const origin = req.headers.get("origin")
  const host = req.headers.get("host") || undefined

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return createCorsResponse(
      origin,
      {
        ok: false,
        error: ErrorCodes.INVALID_JSON,
        message: getErrorMessage(ErrorCodes.INVALID_JSON),
        requestId,
      },
      400,
    )
  }

  const result = SignupSchema.safeParse(body)
  if (!result.success) {
    const firstError = result.error.issues[0]
    return createCorsResponse(
      origin,
      {
        ok: false,
        error: ErrorCodes.VALIDATION_ERROR,
        message: firstError?.message || "Invalid input",
        requestId,
      },
      400,
    )
  }

  const { email, password, name } = result.data
  const normalizedEmail = email.toLowerCase().trim()
  const displayName = name?.trim() || null

  try {
    const iam = await createIamClient("service")

    // Check if email already exists
    const { data: existingUser, error: checkError } = await iam
      .from("users")
      .select("user_id")
      .eq("email", normalizedEmail)
      .single()

    if (existingUser) {
      return createCorsResponse(
        origin,
        {
          ok: false,
          error: ErrorCodes.EMAIL_ALREADY_REGISTERED,
          message: "An account with this email already exists. Please sign in instead.",
          requestId,
        },
        409,
      )
    }

    // PGRST116 means no rows found - that's expected for new email
    if (checkError && checkError.code !== "PGRST116") {
      console.error("[Signup] Error checking email:", checkError)
      throw new Error("Failed to check email availability")
    }

    // Hash password
    const passwordHash = await hashPassword(password)

    // Create user
    const { data: newUser, error: createError } = await iam
      .from("users")
      .insert({
        email: normalizedEmail,
        password_hash: passwordHash,
        display_name: displayName,
        status: "active",
        is_test_env: false,
        metadata: {},
        email_verified: true, // Enable referral rewards immediately (MVP: skip email verification)
      })
      .select("user_id")
      .single()

    if (createError || !newUser) {
      // Handle race condition where email was taken between check and insert
      if (createError?.code === "23505") {
        return createCorsResponse(
          origin,
          {
            ok: false,
            error: ErrorCodes.EMAIL_ALREADY_REGISTERED,
            message: "An account with this email already exists. Please sign in instead.",
            requestId,
          },
          409,
        )
      }
      console.error("[Signup] Error creating user:", createError)
      throw new Error("Failed to create account")
    }

    // Create default organization for user
    const orgId = await getUserDefaultOrgId(newUser.user_id, normalizedEmail)

    // Create JWT session token with scoped org access claims
    // New user starts with one default organization (owner role)
    // Use validated input values since we just created the user with these
    const sessionToken = await createSessionToken(
      {
        userId: newUser.user_id,
        email: normalizedEmail, // Use validated input, not nullable DB field
        name: displayName, // Use validated input, not nullable DB field
        orgIds: [orgId],
        orgRoles: { [orgId]: "owner" },
      }, // No workspaces yet; org-scoped JWT claims
    )

    console.log(`[Signup] Created account for ${normalizedEmail} (org: ${orgId})`)

    const response: SignupResponse = {
      ok: true,
      userId: newUser.user_id,
      email: normalizedEmail, // Use validated input
      message: "Account created successfully",
    }

    const res = createCorsSuccessResponse(origin, response)
    res.cookies.set(COOKIE_NAMES.SESSION, sessionToken, getSessionCookieOptions(host))
    return res
  } catch (error) {
    console.error("[Signup] Unexpected error:", error)
    Sentry.captureException(error)
    return createCorsResponse(
      origin,
      {
        ok: false,
        error: ErrorCodes.INTERNAL_ERROR,
        message: "Failed to create account. Please try again.",
        requestId,
      },
      500,
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || req.headers.get("referer")?.split("/").slice(0, 3).join("/")
  const res = new NextResponse(null, { status: 200 })
  addCorsHeaders(res, origin ?? null)
  return res
}
