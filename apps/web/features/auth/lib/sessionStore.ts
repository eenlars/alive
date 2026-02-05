/**
 * Session store - Supabase IAM backed
 * Stores Claude SDK session IDs for conversation persistence
 *
 * NOTE: Session keys use workspace domain (e.g., "demo.goalive.nl") for compatibility
 * with conversation locking and cancellation, but database uses domain_id internally.
 */

import {
  hasExistingSession,
  isConversationLocked,
  type TabSessionKey,
  tryLockConversation,
  unlockConversation,
} from "@/features/auth/types/session"
import { createAppClient } from "@/lib/supabase/app"
import { createIamClient } from "@/lib/supabase/iam"

export type { TabSessionKey }

export interface SessionStore {
  get(key: TabSessionKey): Promise<string | null>
  set(key: TabSessionKey, value: string): Promise<void>
  delete(key: TabSessionKey): Promise<void>
}

// Parse composite key: userId::workspaceDomain(::wt/<slug>)::tabGroupId::tabId
// NOTE: DB queries only use (userId, domainId, tabId). tabGroupId/worktree are
// returned for callers that need them (e.g., lock keys), but DB ignores them.
function parseKey(key: TabSessionKey): {
  userId: string
  workspaceDomain: string
  tabGroupId: string
  tabId: string
  worktree: string | null
} {
  const parts = key.split("::")
  if (parts.length !== 4 && parts.length !== 5) {
    throw new Error(
      `[SessionStore] Invalid session key: expected 4 or 5 segments (userId::workspace::tabGroupId::tabId or userId::workspace::wt/<slug>::tabGroupId::tabId), got ${parts.length}. Key: "${key}"`,
    )
  }

  const [userId, workspaceDomain, maybeWorktreeOrTabGroup, maybeTabGroupOrTabId, maybeTabId] = parts
  if (parts.length === 4) {
    return {
      userId,
      workspaceDomain: workspaceDomain || "default",
      tabGroupId: maybeWorktreeOrTabGroup,
      tabId: maybeTabGroupOrTabId,
      worktree: null,
    }
  }

  return {
    userId,
    workspaceDomain: workspaceDomain || "default",
    worktree: maybeWorktreeOrTabGroup?.startsWith("wt/") ? maybeWorktreeOrTabGroup.slice(3) : maybeWorktreeOrTabGroup,
    tabGroupId: maybeTabGroupOrTabId,
    tabId: maybeTabId ?? "",
  }
}

// In-memory cache for hostname → domain_id lookups (reduces DB queries by 50%)
// Cache entries expire after 5 minutes to handle domain changes
interface DomainCacheEntry {
  domainId: string
  timestamp: number
}

const domainIdCache = new Map<string, DomainCacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Get domain_id for a hostname, using cache when possible
 * This reduces DB queries from 2 per session operation to 1
 */
async function getDomainId(hostname: string): Promise<string | null> {
  const now = Date.now()
  const cached = domainIdCache.get(hostname)

  // Return cached value if not expired
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.domainId
  }

  // Cache miss or expired - query database
  const app = await createAppClient("service")
  const { data: domain } = await app.from("domains").select("domain_id").eq("hostname", hostname).single()

  if (!domain) {
    // Remove stale cache entry if domain no longer exists
    domainIdCache.delete(hostname)
    return null
  }

  // Update cache
  domainIdCache.set(hostname, {
    domainId: domain.domain_id,
    timestamp: now,
  })

  return domain.domain_id
}

// Periodic cleanup of expired cache entries (skip in tests to avoid leaked timers)
if (typeof setInterval !== "undefined" && typeof process !== "undefined" && !process.env.VITEST) {
  setInterval(
    () => {
      const now = Date.now()
      let cleanedCount = 0

      for (const [hostname, entry] of domainIdCache.entries()) {
        if (now - entry.timestamp > CACHE_TTL_MS) {
          domainIdCache.delete(hostname)
          cleanedCount++
        }
      }

      if (cleanedCount > 0) {
        console.log(`[SessionStore] Cleaned up ${cleanedCount} expired domain cache entries`)
      }
    },
    10 * 60 * 1000,
  )
}

// DB queries use (userId, domainId, tabId) — NOT tabGroupId.
// tabGroupId exists in the key for in-memory lock uniqueness but the DB
// doesn't need it because tabId is a UUID and already globally unique.
// If tabId generation ever changes, add tab_group_id to iam.sessions.
export const sessionStore: SessionStore = {
  async get(key: TabSessionKey): Promise<string | null> {
    const { userId, workspaceDomain, tabId } = parseKey(key)

    // Look up domain_id from hostname (cached)
    const domainId = await getDomainId(workspaceDomain)

    if (!domainId) {
      console.warn(`[SessionStore] Domain not found: ${workspaceDomain}`)
      return null
    }

    // Query session from IAM
    const iam = await createIamClient("service")
    const { data: session } = await iam
      .from("sessions")
      .select("sdk_session_id")
      .eq("user_id", userId)
      .eq("domain_id", domainId)
      .eq("tab_id", tabId)
      .single()

    return session?.sdk_session_id || null
  },

  async set(key: TabSessionKey, value: string): Promise<void> {
    const { userId, workspaceDomain, tabId } = parseKey(key)

    // Look up domain_id from hostname (cached)
    const domainId = await getDomainId(workspaceDomain)

    if (!domainId) {
      throw new Error(`Domain not found: ${workspaceDomain}`)
    }

    // Upsert session in IAM (updates if exists, inserts if not)
    const iam = await createIamClient("service")
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    await iam.from("sessions").upsert(
      {
        user_id: userId,
        domain_id: domainId,
        tab_id: tabId,
        sdk_session_id: value,
        last_activity: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      },
      {
        onConflict: "user_id,domain_id,tab_id",
      },
    )
  },

  async delete(key: TabSessionKey): Promise<void> {
    const { userId, workspaceDomain, tabId } = parseKey(key)

    // Look up domain_id from hostname (cached)
    const domainId = await getDomainId(workspaceDomain)

    if (!domainId) {
      // If domain doesn't exist, session doesn't either - silent success
      return
    }

    // Delete session from IAM
    const iam = await createIamClient("service")
    await iam.from("sessions").delete().eq("user_id", userId).eq("domain_id", domainId).eq("tab_id", tabId)
  },
}

// Primary key builder: Tab is now the primary entity for chat sessions
// Used for BOTH Claude SDK session persistence AND concurrency locking
// Each browser tab = one independent chat session = one Claude SDK session
// Lock key includes tabGroupId to guarantee uniqueness across tabs in the same group
export function tabKey({
  userId,
  workspace,
  worktree,
  tabGroupId,
  tabId,
}: {
  userId: string
  workspace?: string
  worktree?: string | null
  tabGroupId: string
  tabId: string
}): TabSessionKey {
  const workspacePart = workspace ?? "default"
  const worktreePart = worktree ? `::wt/${worktree}` : ""
  return `${userId}::${workspacePart}${worktreePart}::${tabGroupId}::${tabId}` as TabSessionKey
}

// Re-export guards from types/guards/session for backward compatibility
export { tryLockConversation, unlockConversation, isConversationLocked, hasExistingSession }
