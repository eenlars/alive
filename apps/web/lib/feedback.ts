import { getSessionUser } from "@/features/auth/lib/auth"
import type { AppFeedbackInsert } from "@/lib/supabase/app"
import { createAppClient } from "@/lib/supabase/app"

export interface FeedbackEntry {
  id: string
  feedback: string
  email?: string
  workspace: string
  conversationId?: string
  userAgent?: string
  timestamp: string
  status?: string
}

interface FeedbackContext {
  workspace?: string
  conversationId?: string
  userAgent?: string
  email?: string
}
export async function addFeedbackEntry(entry: Omit<FeedbackEntry, "id" | "timestamp">): Promise<FeedbackEntry> {
  const app = await createAppClient("service")

  // Get the current authenticated user (if any)
  const user = await getSessionUser()

  const feedbackInsert: AppFeedbackInsert = {
    content: entry.feedback,
    context: {
      workspace: entry.workspace,
      conversationId: entry.conversationId,
      userAgent: entry.userAgent,
      email: entry.email,
    },
    status: "pending",
    user_id: user?.id ?? null, // Set user_id if authenticated, otherwise null
  }

  const { data, error } = await app.from("feedback").insert(feedbackInsert).select().single()

  if (error || !data) {
    console.error("[Supabase Feedback] Failed to insert feedback:", error)
    throw new Error("Failed to save feedback")
  }

  return {
    id: data.feedback_id,
    feedback: data.content,
    email: entry.email,
    workspace: entry.workspace,
    conversationId: entry.conversationId,
    userAgent: entry.userAgent,
    timestamp: data.created_at || new Date().toISOString(),
    status: data.status || "pending",
  }
}

/**
 * Get all feedback entries from Supabase
 * Excludes feedback from test users
 * @returns Array of feedback entries
 */
export async function getAllFeedback(): Promise<FeedbackEntry[]> {
  const app = await createAppClient("service")

  const { data, error } = await app.from("feedback").select("*").order("created_at", { ascending: false })

  if (error) {
    console.error("[Supabase Feedback] Failed to fetch feedback:", error)
    return []
  }

  // Filter out feedback from test users
  // We need to check if the user_id belongs to a test user
  const userIds = data?.map(item => item.user_id).filter((id): id is string => id !== null) || []

  // Get test user IDs
  let testUserIds = new Set<string>()
  if (userIds.length > 0) {
    const { createIamClient } = await import("@/lib/supabase/iam")
    const iam = await createIamClient("service")
    const { data: testUsers } = await iam.from("users").select("user_id").eq("is_test_env", true).in("user_id", userIds)

    testUserIds = new Set(testUsers?.map(u => u.user_id) || [])
  }

  return (
    data
      ?.filter(item => {
        // Exclude feedback from test users
        if (item.user_id && testUserIds.has(item.user_id)) {
          return false
        }
        return true
      })
      .map(item => {
        const context = item.context as FeedbackContext | null
        return {
          id: item.feedback_id,
          feedback: item.content,
          email: context?.email,
          workspace: context?.workspace || "unknown",
          conversationId: context?.conversationId,
          userAgent: context?.userAgent,
          timestamp: item.created_at || new Date().toISOString(),
          status: item.status || "pending",
        }
      }) || []
  )
}
