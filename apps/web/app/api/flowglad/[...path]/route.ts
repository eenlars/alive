import { nextRouteHandler } from "@flowglad/nextjs/server"
import { env } from "@webalive/env/server"
import { SECURITY } from "@webalive/shared"
import { cookies } from "next/headers"
import { verifySessionToken } from "@/features/auth/lib/jwt"
import { COOKIE_NAMES } from "@/lib/auth/cookies"
import { createFlowgladServer } from "@/lib/flowglad/server"
import { createIamClient } from "@/lib/supabase/iam"

/**
 * FlowGlad API route handler.
 *
 * This route handles all FlowGlad billing operations:
 * - GET /api/flowglad/billing - Get current billing state
 * - POST /api/flowglad/checkout - Create checkout sessions
 * - etc.
 *
 * Authentication: Uses our JWT session cookie to identify the user.
 * Test accounts (is_test_env=true) are blocked from creating Flowglad customers.
 */
export const { GET, POST } = nextRouteHandler({
  getCustomerExternalId: async () => {
    const jar = await cookies()
    const sessionCookie = jar.get(COOKIE_NAMES.SESSION)

    if (!sessionCookie?.value) {
      throw new Error("Not authenticated")
    }

    // Test mode
    if (env.STREAM_ENV === "local" && sessionCookie.value === SECURITY.LOCAL_TEST.SESSION_VALUE) {
      return SECURITY.LOCAL_TEST.SESSION_VALUE
    }

    // Verify JWT and extract user ID
    const payload = await verifySessionToken(sessionCookie.value)

    if (!payload?.userId) {
      throw new Error("Invalid session")
    }

    // Block test accounts from creating Flowglad customers
    const iam = await createIamClient("service")
    const { data: user } = await iam.from("users").select("is_test_env").eq("user_id", payload.userId).single()

    if (user?.is_test_env) {
      throw new Error("Test accounts are not eligible for billing")
    }

    return payload.userId
  },
  flowglad: (customerExternalId: string) => createFlowgladServer(customerExternalId),
  onError: error => {
    console.error("[Flowglad API] Error:", error)
  },
})
