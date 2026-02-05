import { FlowgladServer } from "@flowglad/nextjs/server"
import { getFlowgladSecretKey } from "@webalive/env/server"
import { createIamClient } from "@/lib/supabase/iam"

/**
 * Create a FlowGlad server instance for a specific user.
 *
 * FlowGlad uses `customerExternalId` to identify customers. For WebAlive,
 * this is the user's ID from our iam.users table (B2C model).
 *
 * @param customerExternalId - The user ID from our database
 * @returns FlowgladServer instance scoped to that user
 */
export function createFlowgladServer(customerExternalId: string): FlowgladServer {
  const apiKey = getFlowgladSecretKey()
  if (!apiKey) {
    throw new Error("Flowglad is not configured. Set FLOWGLAD_SECRET_KEY to enable billing in this environment.")
  }

  return new FlowgladServer({
    customerExternalId,
    apiKey,
    getCustomerDetails: async (externalId: string) => {
      // Fetch user details from our database
      const iam = await createIamClient("service")
      const { data: user, error } = await iam
        .from("users")
        .select("email, display_name")
        .eq("user_id", externalId)
        .single()

      if (error || !user) {
        throw new Error(`User not found: ${externalId}`)
      }

      return {
        email: user.email || "",
        name: user.display_name || user.email || "Unknown User",
      }
    },
  })
}

/**
 * Get billing info for a user (server-side).
 * Use this when you need to check subscription status or credits on the server.
 */
export async function getUserBilling(userId: string) {
  const flowglad = createFlowgladServer(userId)
  return flowglad.getBilling()
}

/**
 * Create a checkout session for upgrading/purchasing.
 * Requires either priceSlug or priceId (not both).
 */
export async function createCheckoutSession(
  userId: string,
  params:
    | { priceSlug: string; successUrl: string; cancelUrl: string }
    | { priceId: string; successUrl: string; cancelUrl: string },
) {
  const flowglad = createFlowgladServer(userId)
  return flowglad.createCheckoutSession(params)
}
