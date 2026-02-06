# Referral System

> **Document Type:** SPECIFICATION (not implemented)
> **Status:** COMPLETE
> **Last Updated:** 2025-01-28
> **Owner:** @anthropic-team

---

## Prerequisites

Before implementing, ensure:

- [x] **Loops.so account** - Template ID: cmii5921nxtue310iv5fd9cij
- [x] **Install swr** - Installed
- [x] **Supabase access** - Schema applied, RPCs created

---

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Database schema | ✅ Complete | Migration in Workstream 5 |
| `add_credits` RPC | ✅ Complete | Atomic credit addition |
| `get_or_create_invite_code` RPC | ✅ Complete | Race-safe invite code assignment |
| `@webalive/shared` export | ✅ Complete | `generateInviteCode`, `REFERRAL` constants |
| `apps/web/lib/referral.ts` | ✅ Complete | Client-side helpers |
| `apps/web/lib/api/types.ts` | ✅ Complete | `ReferralData` types added |
| `apps/web/lib/credits/add-credits.ts` | ✅ Complete | Shared credit awarding |
| `apps/web/config/emails.ts` | ✅ Complete | Loops template config |
| `apps/web/lib/test-helpers/request-mocks.ts` | ⬜ Not started | Test mock utilities |
| Landing page `/invite/[code]` | ✅ Complete | Workstream 1 |
| `GET /api/referrals/me` | ✅ Complete | Workstream 6 - Route + tests (needs Workstream 5 schema) |
| `POST /api/referrals/redeem` | ✅ Complete | Workstream 7 |
| `POST /api/referrals/send-invite` | ✅ Complete | Workstream 8 |
| `GET /api/referrals/history` | ✅ Complete | Workstream 9 |
| `POST /api/referrals/complete-pending` | ✅ Complete | Workstream 11 |
| InviteModal integration | ✅ Complete | Workstream 3 - API integration with SWR |
| Post-signup hook | ✅ Complete | Workstream 10 |

**What exists today:**
- All API routes: `/api/referrals/me`, `/redeem`, `/send-invite`, `/history`, `/complete-pending`
- Database: `iam.referrals`, `iam.email_invites` tables, `add_credits` and `get_or_create_invite_code` RPCs
- `InviteModal.tsx` - Full API integration with SWR
- `/invite/[code]` landing page - Stores code with 30-day expiry
- `useRedeemReferral` hook - Integrated in `/chat` page
- `lib/referral.ts`, `lib/credits/add-credits.ts`, `lib/email/send-referral-invite.ts`
- `config/emails.ts` - Loops template configured
- `@webalive/shared` - `REFERRAL` constants, `generateInviteCode()`

**Deferred (not MVP):**
- Real email verification webhook (currently `email_verified = true` on signup)
- "Redeem code" and "Invitation history" buttons in modal footer (placeholders with TODOs)
- `lib/test-helpers/request-mocks.ts` (tests use inline mocks)

---

## Tech Stack
- **Data**: Supabase (`iam.users.invite_code` + `iam.referrals` table)
- **Email**: Loops.so (transactional email for invites)

## Constants

> **Add to existing:** `packages/shared/src/constants.ts`

Constants belong in `@webalive/shared` so all packages can import them without circular dependencies.

```typescript
// packages/shared/src/constants.ts — ADD TO EXISTING FILE

/**
 * Referral System Configuration
 *
 * Used by API routes, database schema defaults, and frontend.
 * SQL schema DEFAULT values must be kept in sync manually.
 */
export const REFERRAL = {
  /** Credits awarded to both referrer and referred user */
  CREDITS: 500,
  /** Days before stored referral code expires in localStorage */
  EXPIRY_DAYS: 30,
  /** Maximum invite emails per user per day */
  EMAIL_DAILY_LIMIT: 10,
  /** Max account age (ms) to redeem referral - prevents existing user exploit */
  ACCOUNT_AGE_LIMIT_MS: 24 * 60 * 60 * 1000, // 24 hours
} as const
```

**Usage:**
```typescript
import { REFERRAL } from "@webalive/shared"
// Access: REFERRAL.CREDITS, REFERRAL.EXPIRY_DAYS, REFERRAL.EMAIL_DAILY_LIMIT
```

## Environment Variables

Add these to `.env.local`:
```bash
# Base URL for invite links (required)
NEXT_PUBLIC_BASE_URL=https://alive.best

# Loops.so API key
LOOPS_API_KEY=your_loops_api_key

# Internal webhook authentication (for email verification callback)
INTERNAL_WEBHOOK_SECRET=generate_a_secure_random_string
```

## Email Templates Config

> **File to create:** `apps/web/config/emails.ts`

```typescript
// apps/web/config/emails.ts — CREATE THIS FILE

export const EMAIL_TEMPLATES = {
  /** Referral invite email - sent when user shares their invite link */
  referralInvite: "clxxxxxxxxxx", // Replace with your Loops transactional ID

  // Add other email types here as needed:
  // welcome: "clxxxxxxxxxx",
  // passwordReset: "clxxxxxxxxxx",
} as const

export type EmailTemplate = keyof typeof EMAIL_TEMPLATES
```

**Setup in Loops.so dashboard:**
1. Create transactional email template called `referral-invite`
2. Define variables: `senderName`, `inviteLink`
3. Copy the transactional ID and paste into `EMAIL_TEMPLATES.referralInvite`

## Dependencies

```bash
# In apps/web (if not already installed)
bun add swr
```

**Package exports to add:**
```typescript
// packages/shared/src/index.ts
export { generateInviteCode } from "./invite-code"
```

## Types

> **Add to existing:** `apps/web/lib/api/types.ts`

Types go in the centralized types file alongside other API types (Organization, LoginResponse, etc.)

```typescript
// apps/web/lib/api/types.ts — ADD TO EXISTING FILE

// ============================================================================
// Referral API Types
// ============================================================================

export interface ReferralData {
  inviteCode: string
  inviteLink: string
  stats: {
    totalReferrals: number
    creditsEarned: number
  }
}

export interface ReferralHistoryItem {
  id: string
  status: "pending" | "completed" | "failed"
  creditsAwarded: number
  createdAt: string
  completedAt: string | null
  referredEmail?: string
  referredName?: string
}

export interface ReferralMeResponse {
  ok: true
  data: ReferralData
}

export interface ReferralRedeemResponse {
  ok: true
  status: "pending" | "completed"
  creditsAwarded?: number
  message?: string
}

export interface ReferralHistoryResponse {
  ok: true
  referrals: ReferralHistoryItem[]
}

// Type guards
export function isReferralData(data: unknown): data is ReferralData {
  return (
    typeof data === "object" &&
    data !== null &&
    "inviteCode" in data &&
    "inviteLink" in data &&
    "stats" in data
  )
}
```

**NOTE:** All referral API routes use the existing `ApiResponse` pattern with `ok: boolean`, NOT a custom `success: boolean` type.

## Helpers

> **File to create:** `apps/web/lib/referral.ts`

Only client-side helpers that don't fit elsewhere:

```typescript
// apps/web/lib/referral.ts — CREATE THIS FILE (minimal)

import { REFERRAL } from "@webalive/shared"

const STORAGE_KEY = "alive_referral"

/**
 * Build invite link from code
 */
export function buildInviteLink(code: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://alive.best"
  return `${baseUrl}/invite/${code}`
}

/**
 * Get stored referral code from localStorage (with expiry check)
 */
export function getStoredReferralCode(): string | null {
  if (typeof window === "undefined") return null

  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return null

  try {
    const { code, expires } = JSON.parse(stored)
    if (Date.now() > expires) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return code
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

/**
 * Store referral code in localStorage with expiry
 */
export function storeReferralCode(code: string): void {
  if (typeof window === "undefined") return
  const expires = Date.now() + REFERRAL.EXPIRY_DAYS * 24 * 60 * 60 * 1000
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ code, expires }))
}

/**
 * Clear stored referral code
 */
export function clearStoredReferralCode(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY)
  }
}
```

**Email validation:** Use Zod's built-in email validation, not custom regex:
```typescript
import { z } from "zod"
const email = z.string().email().safeParse(input)
if (!email.success) return Response.json({ ok: false, error: "Invalid email" }, { status: 400 })
```

## Shared Credit Awarding Function

**CRITICAL**: Extract credit awarding to avoid copy-paste. This function handles the "primary org" lookup pattern used in both `/redeem` and `/complete-pending`.

> **File to create:** `apps/web/lib/credits/add-credits.ts`

Credit operations go in the existing `lib/credits/` directory alongside `supabase-credits.ts`.

```typescript
// apps/web/lib/credits/add-credits.ts — CREATE THIS FILE

import { createIamClient } from "@/lib/supabase/iam"
import { REFERRAL } from "@webalive/shared"

interface AwardCreditsResult {
  success: boolean
  orgId?: string
  newBalance?: number
  error?: string
}

/**
 * Awards credits to a user's primary org using the atomic add_credits RPC.
 * This mirrors the deduct_credits pattern from docs/architecture/atomic-credit-charging.md.
 *
 * Each RPC call is atomic at the row level - the UPDATE + balance return happens
 * in a single database operation with row-level locking.
 *
 * Returns success: false if user has no org (credits not awarded)
 */
export async function awardCreditsToUserPrimaryOrg(
  userId: string,
  amount: number
): Promise<AwardCreditsResult> {
  const iam = await createIamClient("service")

  const { data: membership } = await iam
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .single()

  if (!membership) {
    console.warn(`[Referral] User ${userId} has no org - credits not awarded`)
    return { success: false, error: "no_org" }
  }

  // Atomic credit addition via RPC (see Workstream 5 SQL + atomic-credit-charging.md)
  const { data: newBalance, error } = await iam.rpc("add_credits", {
    p_org_id: membership.org_id,
    p_amount: amount,
  })

  if (error) {
    console.error(`[Referral] Failed to add credits to org ${membership.org_id}:`, error)
    return { success: false, error: "credit_failed" }
  }

  console.log(`[Referral] Awarded ${amount} credits to org ${membership.org_id}, new balance: ${newBalance}`)
  return { success: true, orgId: membership.org_id, newBalance: newBalance as number }
}

/**
 * Awards credits to both referrer and referred user's primary orgs.
 *
 * ATOMICITY NOTE:
 * - Each individual add_credits RPC call IS atomic (row-level locking in PostgreSQL)
 * - The two calls together are NOT wrapped in a transaction
 *
 * This is acceptable for MVP because:
 * 1. add_credits uses UPDATE...RETURNING - atomic at the row level
 * 2. Credit additions don't have the negative-balance risk that deductions have
 * 3. If one fails, the referral record shows expected amount for manual reconciliation
 * 4. Failures are logged with full context for support tickets
 *
 * UPGRADE PATH: If partial awards become a support burden, create a DB function:
 *
 *   CREATE FUNCTION iam.award_referral_credits(
 *     p_referrer_org_id TEXT,
 *     p_referred_org_id TEXT,
 *     p_amount NUMERIC
 *   ) RETURNS TABLE(referrer_balance NUMERIC, referred_balance NUMERIC) AS $$
 *   BEGIN
 *     UPDATE iam.orgs SET credits = credits + p_amount WHERE org_id = p_referrer_org_id;
 *     UPDATE iam.orgs SET credits = credits + p_amount WHERE org_id = p_referred_org_id;
 *     RETURN QUERY SELECT
 *       (SELECT credits FROM iam.orgs WHERE org_id = p_referrer_org_id),
 *       (SELECT credits FROM iam.orgs WHERE org_id = p_referred_org_id);
 *   END;
 *   $$ LANGUAGE plpgsql;
 *
 * This wraps both updates in a single transaction - all-or-nothing.
 */
export async function awardReferralCredits(
  referrerId: string,
  referredId: string,
  amount: number = REFERRAL.CREDITS
): Promise<{ referrerResult: AwardCreditsResult; referredResult: AwardCreditsResult }> {
  const [referrerResult, referredResult] = await Promise.all([
    awardCreditsToUserPrimaryOrg(referrerId, amount),
    awardCreditsToUserPrimaryOrg(referredId, amount),
  ])

  // Log summary for debugging partial failures
  if (!referrerResult.success || !referredResult.success) {
    console.error(`[Referral] Partial credit award:`, {
      referrer: { userId: referrerId, ...referrerResult },
      referred: { userId: referredId, ...referredResult },
      amount,
    })
  }

  return { referrerResult, referredResult }
}
```

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Credits awarded to | User's **primary org** (first org membership) | Simple, predictable |
| When invite_code generated | **First login** (app code checks if null) | No webhook complexity |
| Existing user clicks invite | **Store code, but won't redeem** (already has account) | Graceful, no error |
| Landing page redirect | **`/`** (home handles auth state) | Simple |
| localStorage expiry | **30 days** | Prevents stale referrals |
| Credit farming prevention | **Require email verification** before awarding | Security |

---

## Workstreams (can be done in parallel)

---

### Workstream 1: Landing Page `/invite/[code]`

**File to create:** `apps/web/app/invite/[code]/page.tsx`

**What it does:**
1. User visits `alive.best/invite/ABC123`
2. Page extracts `ABC123` from URL
3. Stores code in localStorage WITH 30-day expiry
4. Redirects to home page `/`

**Acceptance criteria:**
- [ ] Visiting `/invite/ABC123` stores `{ code: "ABC123", expires: <30 days from now> }` in localStorage
- [ ] Immediately redirects to `/` (no flash of content)
- [ ] Works with any alphanumeric code (10 chars)
- [ ] If code is missing/empty, still redirects to `/` (no error)
- [ ] SSR-safe (localStorage only accessed client-side)

**Code:**
```tsx
"use client"

import { useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { REFERRAL } from "@webalive/shared"

export default function InvitePage() {
  const router = useRouter()
  const params = useParams()
  const code = params.code as string

  useEffect(() => {
    if (code && typeof window !== "undefined") {
      const expires = Date.now() + REFERRAL.EXPIRY_DAYS * 24 * 60 * 60 * 1000
      localStorage.setItem("alive_referral", JSON.stringify({ code, expires }))
    }
    router.replace("/")
  }, [code, router])

  return null
}
```

**Helper to read referral code:**
```typescript
// apps/web/lib/referral.ts (continued)

const STORAGE_KEY = "alive_referral"

export function getStoredReferralCode(): string | null {
  if (typeof window === "undefined") return null

  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return null

  try {
    const { code, expires } = JSON.parse(stored)
    if (Date.now() > expires) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return code
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

export function clearStoredReferralCode(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY)
  }
}
```

---

### Workstream 2: Invite Code Generator

**File to create:** `packages/shared/src/invite-code.ts`

**What it does:**
- Generates a unique, URL-safe invite code
- Deterministic: same input → same output
- 10 characters, uppercase alphanumeric (no ambiguous chars)

**Acceptance criteria:**
- [ ] `generateInviteCode(userId)` returns 10-char uppercase string
- [ ] Same userId always returns same code
- [ ] Only contains: `A-Z` (no O, I), `2-9` (no 0, 1)
- [ ] Exported from `@webalive/shared` (add to `packages/shared/src/index.ts`)
- [ ] Works in Node.js (NOT edge runtime)

**Code:**
```typescript
// packages/shared/src/invite-code.ts

import { createHash } from "crypto"

// Unambiguous characters (no 0/O, 1/I/L confusion)
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789" // 32 chars

export function generateInviteCode(userId: string): string {
  const hash = createHash("sha256")
    .update(userId + "alive-invite-v1")
    .digest("hex")

  let code = ""
  for (let i = 0; i < 10; i++) {
    const index = parseInt(hash.slice(i * 2, i * 2 + 2), 16) % ALPHABET.length
    code += ALPHABET[index]
  }

  return code
}
```

**Tests:**
```typescript
// packages/shared/src/__tests__/invite-code.test.ts

import { generateInviteCode } from "../invite-code"

describe("generateInviteCode", () => {
  it("returns 10 character string", () => {
    expect(generateInviteCode("user_123")).toHaveLength(10)
  })

  it("is deterministic", () => {
    const code1 = generateInviteCode("user_123")
    const code2 = generateInviteCode("user_123")
    expect(code1).toBe(code2)
  })

  it("different users get different codes", () => {
    const code1 = generateInviteCode("user_123")
    const code2 = generateInviteCode("user_456")
    expect(code1).not.toBe(code2)
  })

  it("only contains unambiguous characters", () => {
    const code = generateInviteCode("user_123")
    // Only A-Z (no O, I) and 2-9 (no 0, 1)
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/)
  })
})
```

---

### Workstream 3: InviteModal API Integration

**File to modify:** `apps/web/components/modals/InviteModal.tsx`

**What it does:**
- Fetches user's invite code from API
- Shows loading state while fetching
- Displays real invite link and stats

**Acceptance criteria:**
- [ ] Calls `GET /api/referrals/me` on mount
- [ ] Shows skeleton/loading while fetching
- [ ] Displays invite link with user's actual code
- [ ] Shows stats: total referrals, credits earned
- [ ] Handles error state gracefully

**API response shape:**
```typescript
interface ReferralData {
  inviteCode: string
  inviteLink: string
  stats: {
    totalReferrals: number
    creditsEarned: number
  }
}
```

**Full integration:**
```tsx
// apps/web/components/modals/InviteModal.tsx

"use client"

import { Check, ChevronRight, Heart, Link, Send, X } from "lucide-react"
import { useState } from "react"
import useSWR from "swr"
import { Modal } from "@/components/ui/Modal"
import { REFERRAL } from "@webalive/shared"
import type { ReferralData } from "@/lib/api/types"

interface InviteModalProps {
  onClose: () => void
}

// Fetcher that extracts data from standardized response (uses ok: boolean pattern)
const fetcher = async (url: string) => {
  const res = await fetch(url)
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || "Failed to fetch")
  return json.data
}

export function InviteModal({ onClose }: InviteModalProps) {
  const [email, setEmail] = useState("")
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sendSuccess, setSendSuccess] = useState(false)

  // Fetch referral data from API
  const { data, error, isLoading } = useSWR<ReferralData>(
    "/api/referrals/me",
    fetcher
  )

  const inviteLink = data?.inviteLink ?? ""

  const handleCopy = async () => {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  const handleSendEmail = async () => {
    if (!email.trim() || sending) return
    setSendError(null)
    setSendSuccess(false)
    setSending(true)

    try {
      const res = await fetch("/api/referrals/send-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setSendError(data.error || "Failed to send")
      } else {
        setSendSuccess(true)
        setEmail("")
        setTimeout(() => setSendSuccess(false), 3000)
      }
    } catch (err) {
      setSendError("Network error")
    } finally {
      setSending(false)
    }
  }

  const isValidEmail = email.includes("@") && email.includes(".")

  return (
    <Modal isOpen={true} onClose={onClose} showCloseButton={false} size="sm" className="relative w-[560px]">
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-3 right-3 p-1.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors z-10"
        aria-label="Close"
      >
        <X size={16} className="text-black/40 dark:text-white/40" />
      </button>

      {/* Hero section */}
      <div className="flex flex-col items-center px-6 pt-8 pb-6">
        <div className="w-14 h-14 flex items-center justify-center bg-black/5 dark:bg-white/5 mb-4">
          <Heart size={28} className="text-black dark:text-white" />
        </div>
        <h3 className="text-xl font-medium text-black dark:text-white text-center">
          Invite to get credits
        </h3>
        <p className="mt-2 text-sm text-black/50 dark:text-white/50 text-center max-w-[320px]">
          Share your invitation link with friends, get {REFERRAL.CREDITS} credits each.
        </p>
      </div>

      {/* Content */}
      <div className="px-6 pb-6 space-y-5">
        {/* Loading state */}
        {isLoading && (
          <div className="text-center text-sm text-black/40 dark:text-white/40 py-4">
            Loading your invite link...
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="text-center text-sm text-red-500 py-4">
            Failed to load invite link
          </div>
        )}

        {/* Loaded state */}
        {data && (
          <>
            {/* Share link section */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-black/50 dark:text-white/50">
                Share your invitation link
              </label>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center px-3 py-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 overflow-hidden">
                  <span className="text-sm text-black/60 dark:text-white/60 truncate">
                    {inviteLink}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-2 px-4 py-2 bg-black text-white dark:bg-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90 transition-colors text-sm font-medium whitespace-nowrap"
                >
                  {copied ? <><Check size={14} /> Copied</> : <><Link size={14} /> Copy</>}
                </button>
              </div>
            </div>

            {/* Email invite section */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-black/50 dark:text-white/50">
                Email your invitation
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="Enter email address"
                  className="flex-1 px-3 py-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 outline-none focus:border-black/20 dark:focus:border-white/20 transition-colors"
                />
                <button
                  type="button"
                  onClick={handleSendEmail}
                  disabled={!isValidEmail || sending}
                  className="flex items-center gap-2 px-4 py-2 bg-black text-white dark:bg-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90 transition-colors text-sm font-medium whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send size={14} />
                  {sending ? "Sending..." : sendSuccess ? "Sent!" : "Send"}
                </button>
              </div>
              {sendError && (
                <p className="text-xs text-red-500">{sendError}</p>
              )}
            </div>

            {/* Divider - preserved from existing UI */}
            <div className="flex items-center gap-3 pt-2">
              <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
              <span className="text-xs text-black/40 dark:text-white/40">Invitation history</span>
              <div className="flex-1 h-px bg-black/10 dark:bg-white/10" />
            </div>

            {/* Stats card - preserved from existing UI */}
            <div className="flex items-center justify-between p-4 bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10">
              <div className="flex gap-12">
                <div>
                  <div className="text-lg font-semibold text-black dark:text-white">
                    {data.stats.creditsEarned}
                  </div>
                  <div className="text-xs text-black/40 dark:text-white/40">Credits</div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-black dark:text-white">
                    {data.stats.totalReferrals}
                  </div>
                  <div className="text-xs text-black/40 dark:text-white/40">Referrals</div>
                </div>
              </div>
              {/* Icon - preserved from existing UI */}
              <div className="w-12 h-12 flex items-center justify-center opacity-10">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="currentColor" className="text-black dark:text-white">
                  <path d="M28 16C28 11.5817 24.4183 8 20 8C15.5817 8 12 11.5817 12 16C12 20.4183 15.5817 24 20 24C24.4183 24 28 20.4183 28 16ZM32 16C32 19.892 30.1451 23.3485 27.2734 25.541C29.2868 26.4307 31.1419 27.6849 32.7285 29.2715C36.1042 32.6471 38 37.2261 38 42C38 43.1046 37.1046 44 36 44C34.8954 44 34 43.1046 34 42C34 38.287 32.5259 34.7251 29.9004 32.0996C27.4388 29.638 24.1539 28.189 20.6934 28.0176L20 28C16.287 28 12.7251 29.4741 10.0996 32.0996C7.4741 34.7251 6 38.287 6 42C6 43.1046 5.10457 44 4 44C2.89543 44 2 43.1046 2 42C2 37.2261 3.89583 32.6471 7.27148 29.2715C8.85764 27.6853 10.7119 26.4307 12.7246 25.541C9.85362 23.3484 8 19.8914 8 16C8 9.37258 13.3726 4 20 4C26.6274 4 32 9.37258 32 16Z" />
                </svg>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer - preserved from existing UI */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-black/10 dark:border-white/10">
        <button
          type="button"
          className="text-xs text-black/40 dark:text-white/40 hover:text-black/60 dark:hover:text-white/60 underline transition-colors"
        >
          Redeem code
        </button>
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-black/40 dark:text-white/40 hover:text-black/60 dark:hover:text-white/60 transition-colors"
        >
          Invitation history
          <ChevronRight size={14} />
        </button>
      </div>
    </Modal>
  )
}
```

---

### Workstream 4: Email via Loops.so

**What it does:**
- Send referral invite emails via Loops.so transactional API
- Rate limited: max 10 emails per user per day

**Setup:**
1. In Loops.so dashboard: Create transactional email template called `referral-invite`
2. Define template variables: `senderName`, `inviteLink`
3. Copy the transactional ID
4. Paste ID into `apps/web/config/emails.ts` under `EMAIL_TEMPLATES.referralInvite`

**Code:**
```typescript
// apps/web/lib/email/send-referral-invite.ts

import { EMAIL_TEMPLATES } from "@/config/emails"

export async function sendReferralInvite({
  to,
  senderName,
  inviteLink,
}: {
  to: string
  senderName: string
  inviteLink: string
}) {
  const LOOPS_API_KEY = process.env.LOOPS_API_KEY
  if (!LOOPS_API_KEY) {
    throw new Error("LOOPS_API_KEY not configured")
  }

  const response = await fetch("https://app.loops.so/api/v1/transactional", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOOPS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transactionalId: EMAIL_TEMPLATES.referralInvite,
      email: to,
      dataVariables: {
        senderName,
        inviteLink,
      },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Loops API error: ${response.status} - ${error}`)
  }

  return response.json()
}
```

---

### Workstream 5: Supabase Schema

**Run these migrations:**

```sql
-- 1. Add columns to users
ALTER TABLE iam.users
ADD COLUMN invite_code TEXT UNIQUE,
ADD COLUMN email_verified BOOLEAN DEFAULT false;

CREATE INDEX idx_users_invite_code ON iam.users(invite_code);

-- 2. Create add_credits function (mirror of deduct_credits)
CREATE OR REPLACE FUNCTION iam.add_credits(p_org_id TEXT, p_amount NUMERIC)
RETURNS NUMERIC AS $$
DECLARE
  new_balance NUMERIC;
BEGIN
  UPDATE iam.orgs
  SET credits = credits + p_amount,
      updated_at = NOW()
  WHERE org_id = p_org_id
  RETURNING credits INTO new_balance;

  RETURN new_balance;
END;
$$ LANGUAGE plpgsql;

-- 2b. Create get_or_create_invite_code function (race-safe invite code assignment)
-- This atomically assigns an invite code if none exists, or returns the existing one.
-- Uses UPDATE...WHERE invite_code IS NULL + RETURNING to handle race conditions.
CREATE OR REPLACE FUNCTION iam.get_or_create_invite_code(
  p_user_id TEXT,
  p_new_code TEXT
)
RETURNS TEXT AS $$
DECLARE
  existing_code TEXT;
BEGIN
  -- First try to get existing code (fast path)
  SELECT invite_code INTO existing_code
  FROM iam.users
  WHERE user_id = p_user_id;

  IF existing_code IS NOT NULL THEN
    RETURN existing_code;
  END IF;

  -- Try to set the code atomically (only if still null)
  UPDATE iam.users
  SET invite_code = p_new_code
  WHERE user_id = p_user_id AND invite_code IS NULL
  RETURNING invite_code INTO existing_code;

  -- If we got a result, we set it successfully
  IF existing_code IS NOT NULL THEN
    RETURN existing_code;
  END IF;

  -- Another request beat us - fetch what they set
  SELECT invite_code INTO existing_code
  FROM iam.users
  WHERE user_id = p_user_id;

  RETURN existing_code;
END;
$$ LANGUAGE plpgsql;

-- 3. Create referrals table (uses user_id, not clerk_id)
-- ⚠️  IMPORTANT: The DEFAULT value below MUST match REFERRAL.CREDITS in @webalive/shared/constants.ts
-- If you change the credit amount, update BOTH places!
CREATE TABLE iam.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id TEXT NOT NULL REFERENCES iam.users(user_id),
  referred_id TEXT UNIQUE NOT NULL REFERENCES iam.users(user_id),
  credits_awarded INTEGER NOT NULL DEFAULT 500, -- ⚠️  Must match REFERRAL.CREDITS in @webalive/shared
  status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, failed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_referrals_referrer ON iam.referrals(referrer_id);
CREATE INDEX idx_referrals_status ON iam.referrals(status);

-- 4. Email invites tracking (rate limiting)
CREATE TABLE iam.email_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id TEXT NOT NULL REFERENCES iam.users(user_id),
  email TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sender_id, email)
);

CREATE INDEX idx_email_invites_sender_date ON iam.email_invites(sender_id, sent_at);
```

**Acceptance criteria:**
- [ ] `invite_code` column exists on `iam.users` with unique index
- [ ] `email_verified` column exists on `iam.users`
- [ ] `add_credits` RPC function created
- [ ] `get_or_create_invite_code` RPC function created (race-safe invite code assignment)
- [ ] `iam.referrals` table created with status tracking
- [ ] `iam.email_invites` table for rate limiting
- [ ] Types regenerated (`bun run gen:db`)

**Note on `email_verified`:** This column must be set to `true` when user verifies their email.

**Bootstrap strategy for existing users:**
```sql
-- Option 1: Mark all existing users as verified (trust existing accounts)
UPDATE iam.users SET email_verified = true WHERE created_at < NOW();

-- Option 2: Mark verified based on activity (users who've used the product)
UPDATE iam.users SET email_verified = true
WHERE user_id IN (SELECT DISTINCT user_id FROM app.conversations);
```

**Ongoing verification options:**
1. **Signup flow**: Set during email verification step (if you have one)
2. **Webhook**: Listen to auth provider's email verification webhook and call `/api/referrals/complete-pending`
3. **Skip for MVP**: Set `email_verified = true` in user creation, disable fraud check temporarily

---

### Workstream 6: API - GET /api/referrals/me

**File:** `apps/web/app/api/referrals/me/route.ts`

**What it does:**
- Returns user's invite code (generates if missing)
- Returns referral stats

**Runtime:** Must be Node.js (not Edge) for crypto module
```typescript
export const runtime = "nodejs"
```

**Code:**
```typescript
// apps/web/app/api/referrals/me/route.ts

import { NextResponse } from "next/server"
import { createIamClient } from "@/lib/supabase/iam"
import { getSessionUser } from "@/features/auth/lib/auth"
import { generateInviteCode } from "@webalive/shared"
import { buildInviteLink } from "@/lib/referral"

export const runtime = "nodejs"

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }
  const userId = user.id

  const iam = await createIamClient("service")

  // Generate a candidate invite code (deterministic from userId)
  const candidateCode = generateInviteCode(userId)

  // Use atomic RPC to get existing code or set this one
  // This is truly race-safe - the DB function handles all edge cases
  const { data: inviteCode, error: rpcError } = await iam.rpc("get_or_create_invite_code", {
    p_user_id: userId,
    p_new_code: candidateCode,
  })

  if (rpcError) {
    console.error("[Referral] Failed to get/create invite code:", rpcError)
    return NextResponse.json({ ok: false, error: "Failed to generate invite code" }, { status: 500 })
  }

  if (!inviteCode) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 })
  }

  // Get stats
  const { count: totalReferrals } = await iam
    .from("referrals")
    .select("*", { count: "exact", head: true })
    .eq("referrer_id", userId)
    .eq("status", "completed")

  const { data: creditsData } = await iam
    .from("referrals")
    .select("credits_awarded")
    .eq("referrer_id", userId)
    .eq("status", "completed")

  const creditsEarned = creditsData?.reduce((sum, r) => sum + r.credits_awarded, 0) ?? 0

  return NextResponse.json({
    ok: true,
    data: {
      inviteCode,
      inviteLink: buildInviteLink(inviteCode as string),
      stats: {
        totalReferrals: totalReferrals ?? 0,
        creditsEarned,
      },
    },
  })
}
```

---

### Workstream 7: API - POST /api/referrals/redeem

**File:** `apps/web/app/api/referrals/redeem/route.ts`

**What it does:**
- Called after signup to redeem stored referral code
- Validates code, creates referral record, awards credits
- Uses transaction to ensure atomicity

**Code:**
```typescript
// apps/web/app/api/referrals/redeem/route.ts

import { NextResponse } from "next/server"
import { createIamClient } from "@/lib/supabase/iam"
import { getSessionUser } from "@/features/auth/lib/auth"
import { REFERRAL } from "@webalive/shared"
import { awardReferralCredits } from "@/lib/credits/add-credits"

export const runtime = "nodejs"

// Standardized error response - all validation failures return this
const INVALID_CODE_RESPONSE = NextResponse.json(
  { ok: false, error: "Invalid code" },
  { status: 400 }
)

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }
  const userId = user.id

  // Parse JSON with robust error handling (handles throws AND null returns)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const { code } = body as { code?: unknown }
  if (!code || typeof code !== "string") {
    return INVALID_CODE_RESPONSE
  }

  const iam = await createIamClient("service")

  // 1. Check user is new (created within last 24h) - prevents existing user exploit
  const { data: currentUser } = await iam
    .from("users")
    .select("created_at, email_verified")
    .eq("user_id", userId)
    .single()

  if (!currentUser) {
    return INVALID_CODE_RESPONSE
  }

  const userAge = Date.now() - new Date(currentUser.created_at).getTime()
  if (userAge > REFERRAL.ACCOUNT_AGE_LIMIT_MS) {
    // User account too old - silently reject (don't reveal why)
    return INVALID_CODE_RESPONSE
  }

  // 2. Check if user already referred
  const { data: existingReferral } = await iam
    .from("referrals")
    .select("id")
    .eq("referred_id", userId)
    .single()

  if (existingReferral) {
    return INVALID_CODE_RESPONSE
  }

  // 3. Find referrer by code
  const { data: referrer } = await iam
    .from("users")
    .select("user_id, email_verified")
    .eq("invite_code", code.toUpperCase())
    .single()

  if (!referrer) {
    return INVALID_CODE_RESPONSE
  }

  // 4. Prevent self-referral
  if (referrer.user_id === userId) {
    return INVALID_CODE_RESPONSE
  }

  // 5. Check referred user has verified email (anti-fraud)
  if (!currentUser.email_verified) {
    // Create pending referral, will complete after verification
    await iam.from("referrals").insert({
      referrer_id: referrer.user_id,
      referred_id: userId,
      status: "pending",
      credits_awarded: REFERRAL.CREDITS,
    })
    return NextResponse.json({
      ok: true,
      status: "pending",
      message: "Verify your email to complete referral"
    })
  }

  // 6. Create completed referral
  const { error: insertError } = await iam.from("referrals").insert({
    referrer_id: referrer.user_id,
    referred_id: userId,
    status: "completed",
    credits_awarded: REFERRAL.CREDITS,
    completed_at: new Date().toISOString(),
  })

  if (insertError) {
    console.error("Failed to create referral:", insertError)
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 })
  }

  // 7. Award credits to both parties using shared function
  const { referrerResult, referredResult } = await awardReferralCredits(
    referrer.user_id,
    userId,
    REFERRAL.CREDITS
  )

  // Log any credit award failures for manual reconciliation
  if (!referrerResult.success || !referredResult.success) {
    console.warn("[Referral] Partial credit award:", { referrerResult, referredResult })
  }

  return NextResponse.json({
    ok: true,
    data: { status: "completed", creditsAwarded: REFERRAL.CREDITS }
  })
}
```

---

### Workstream 8: API - POST /api/referrals/send-invite

**File:** `apps/web/app/api/referrals/send-invite/route.ts`

**What it does:**
- Sends email invitation via Loops.so
- Rate limited: 10 emails per day per user

**Code:**
```typescript
// apps/web/app/api/referrals/send-invite/route.ts

import { NextResponse } from "next/server"
import { createIamClient } from "@/lib/supabase/iam"
import { getSessionUser } from "@/features/auth/lib/auth"
import { sendReferralInvite } from "@/lib/email/send-referral-invite"
import { REFERRAL } from "@webalive/shared"
import { buildInviteLink } from "@/lib/referral"
import { z } from "zod"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }
  const userId = user.id

  // Parse JSON with robust error handling (handles throws AND null returns)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const { email } = body as { email?: unknown }
  const emailResult = z.string().email().safeParse(email)
  if (!emailResult.success) {
    return NextResponse.json({ ok: false, error: "Invalid email address" }, { status: 400 })
  }
  const validEmail = emailResult.data

  const iam = await createIamClient("service")

  // Check rate limit (emails sent in last 24h)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await iam
    .from("email_invites")
    .select("*", { count: "exact", head: true })
    .eq("sender_id", userId)
    .gte("sent_at", oneDayAgo)

  if ((count ?? 0) >= REFERRAL.EMAIL_DAILY_LIMIT) {
    return NextResponse.json({
      ok: false,
      error: `Daily limit reached (${REFERRAL.EMAIL_DAILY_LIMIT} emails)`
    }, { status: 429 })
  }

  // Check if already sent to this email
  const { data: existing } = await iam
    .from("email_invites")
    .select("id")
    .eq("sender_id", userId)
    .eq("email", validEmail.toLowerCase())
    .single()

  if (existing) {
    return NextResponse.json({
      ok: false,
      error: "Already sent invite to this email"
    }, { status: 400 })
  }

  // Get sender info
  const { data: sender } = await iam
    .from("users")
    .select("display_name, invite_code")
    .eq("user_id", userId)
    .single()

  if (!sender?.invite_code) {
    return NextResponse.json({ ok: false, error: "No invite code" }, { status: 400 })
  }

  // Send email
  // NOTE: No automatic retry - if Loops.so fails, the user sees an error and can retry manually.
  // The email_invites record is only created AFTER successful send, so failed sends can be retried.
  //
  // FUTURE IMPROVEMENT: Add to a queue (Inngest, QStash) for automatic retry with exponential backoff.
  // This would prevent silent loss if Loops.so has transient failures.
  try {
    await sendReferralInvite({
      to: validEmail,
      senderName: sender.display_name || "Someone",
      inviteLink: buildInviteLink(sender.invite_code),
    })
  } catch (error) {
    console.error("Failed to send invite email:", error)
    return NextResponse.json({ ok: false, error: "Failed to send email" }, { status: 500 })
  }

  // Record sent email (only after successful send)
  await iam.from("email_invites").insert({
    sender_id: userId,
    email: validEmail.toLowerCase(),
  })

  return NextResponse.json({ ok: true })
}
```

---

### Workstream 9: API - GET /api/referrals/history

**File:** `apps/web/app/api/referrals/history/route.ts`

**Code:**
```typescript
// apps/web/app/api/referrals/history/route.ts

import { NextResponse } from "next/server"
import { createIamClient } from "@/lib/supabase/iam"
import { getSessionUser } from "@/features/auth/lib/auth"

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }
  const userId = user.id

  const iam = await createIamClient("service")

  // Get referrals with referred user info via separate query
  // (Supabase join syntax can be tricky with custom FKs)
  const { data: referrals } = await iam
    .from("referrals")
    .select("id, status, credits_awarded, created_at, completed_at, referred_id")
    .eq("referrer_id", userId)
    .order("created_at", { ascending: false })

  if (!referrals?.length) {
    return NextResponse.json({ ok: true, data: { referrals: [] } })
  }

  // Get referred users
  const referredIds = referrals.map(r => r.referred_id)
  const { data: users } = await iam
    .from("users")
    .select("user_id, email, display_name")
    .in("user_id", referredIds)

  const userMap = new Map(users?.map(u => [u.user_id, u]) ?? [])

  return NextResponse.json({
    ok: true,
    data: {
      referrals: referrals.map(r => {
        const referredUser = userMap.get(r.referred_id)
        return {
          id: r.id,
          status: r.status,
          creditsAwarded: r.credits_awarded,
          createdAt: r.created_at,
          completedAt: r.completed_at,
          referredEmail: referredUser?.email,
          referredName: referredUser?.display_name,
        }
      }),
    }
  })
}
```

---

### Workstream 10: Post-Signup Hook

**Where:** `apps/web/app/chat/page.tsx` (or auth callback)

**What it does:**
- On first login, check for stored referral code
- Call redeem API
- Clear stored code

**Code:**
```typescript
// apps/web/hooks/useRedeemReferral.ts

import { useEffect, useRef } from "react"
import { getStoredReferralCode, clearStoredReferralCode } from "@/lib/referral"

export function useRedeemReferral() {
  const attempted = useRef(false)

  useEffect(() => {
    if (attempted.current) return
    attempted.current = true

    const code = getStoredReferralCode()
    if (!code) return

    fetch("/api/referrals/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then(async res => {
        const data = await res.json()

        if (data.ok) {
          // Success - clear the code
          console.log("Referral redeemed:", data.status)
          clearStoredReferralCode()
        } else if (res.status === 400) {
          // Client error (invalid code, already referred, etc) - clear to prevent retry
          console.log("Referral not valid:", data.error)
          clearStoredReferralCode()
        }
        // On 500 server error: DON'T clear - allow retry on next page load
      })
      .catch(err => {
        // Network error - DON'T clear, allow retry
        console.error("Referral redeem failed:", err)
      })
  }, [])
}
```

**Usage in chat page:**
```tsx
// apps/web/app/chat/page.tsx

import { useRedeemReferral } from "@/hooks/useRedeemReferral"

function ChatPageContent() {
  useRedeemReferral() // Redeem on first load if code exists
  // ... rest of component
}
```

---

### Workstream 11: Complete Pending Referrals

**File:** `apps/web/app/api/referrals/complete-pending/route.ts`

**What it does:**
- Called when user verifies their email
- Finds any pending referral for this user
- Completes it and awards credits

**When to call:**
- After email verification webhook fires
- Or manually via admin action

**Code:**
```typescript
// apps/web/app/api/referrals/complete-pending/route.ts

import { NextResponse } from "next/server"
import { createIamClient } from "@/lib/supabase/iam"
import { awardReferralCredits } from "@/lib/credits/add-credits"

export const runtime = "nodejs"

// Called by webhook or internal system (not user-facing)
export async function POST(req: Request) {
  // Parse JSON with robust error handling (handles throws AND null returns)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const { userId, secret } = body as { userId?: unknown; secret?: unknown }

  // Verify internal secret (webhook auth)
  if (secret !== process.env.INTERNAL_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ ok: false, error: "Missing userId" }, { status: 400 })
  }

  const iam = await createIamClient("service")

  // Find pending referral for this user
  const { data: pendingReferral } = await iam
    .from("referrals")
    .select("id, referrer_id, referred_id, credits_awarded")
    .eq("referred_id", userId)
    .eq("status", "pending")
    .single()

  if (!pendingReferral) {
    // 200 with success: false - no pending referral is not an error
    return NextResponse.json({ ok: false, error: "No pending referral" })
  }

  // Update to completed
  const { error: updateError } = await iam
    .from("referrals")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", pendingReferral.id)

  if (updateError) {
    console.error("Failed to update referral status:", updateError)
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 })
  }

  // Award credits to both parties using shared function
  const { referrerResult, referredResult } = await awardReferralCredits(
    pendingReferral.referrer_id,
    userId,
    pendingReferral.credits_awarded
  )

  // Log any credit award failures for manual reconciliation
  if (!referrerResult.success || !referredResult.success) {
    console.warn("[Referral] Partial credit award on complete-pending:", {
      referralId: pendingReferral.id,
      referrerResult,
      referredResult
    })
  }

  return NextResponse.json({
    ok: true,
    data: {
      referralId: pendingReferral.id,
      creditsAwarded: pendingReferral.credits_awarded,
    }
  })
}
```

**Env var needed:**
```
INTERNAL_WEBHOOK_SECRET=your_secret_here
```

---

## State Machine

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           VISITOR JOURNEY                                    │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────┐
                    │  Visitor lands   │
                    │  on /invite/CODE │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │  Store CODE +    │
                    │  30-day expiry   │
                    │  in localStorage │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │  Redirect to /   │
                    └────────┬─────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
     ┌────────────────┐           ┌────────────────┐
     │  User signs up │           │  User leaves   │
     │  (new account) │           │  (code stays   │
     └───────┬────────┘           │  30 days)      │
             │                    └────────────────┘
             ▼
     ┌────────────────┐
     │  First login   │
     │  triggers      │
     │  useRedeemRef  │
     └───────┬────────┘
             │
             ▼
        REDEEM FLOW


┌─────────────────────────────────────────────────────────────────────────────┐
│                           REDEEM FLOW                                        │
└─────────────────────────────────────────────────────────────────────────────┘

     ┌──────────────┐
     │ POST /redeem │
     │ { code }     │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐     NO      ┌──────────────┐
     │ Account      ├────────────►│ Return error │
     │ < 24h old?   │             │ "invalid"    │
     └──────┬───────┘             └──────────────┘
            │ YES
            ▼
     ┌──────────────┐     YES     ┌──────────────┐
     │ Already      ├────────────►│ Return error │
     │ referred?    │             │ "invalid"    │
     └──────┬───────┘             └──────────────┘
            │ NO
            ▼
     ┌──────────────┐     NO      ┌──────────────┐
     │ Code valid?  ├────────────►│ Return error │
     │ (exists)     │             │ "invalid"    │
     └──────┬───────┘             └──────────────┘
            │ YES
            ▼
     ┌──────────────┐     YES     ┌──────────────┐
     │ Self         ├────────────►│ Return error │
     │ referral?    │             │ "invalid"    │
     └──────┬───────┘             └──────────────┘
            │ NO
            ▼
     ┌──────────────┐     NO      ┌──────────────┐
     │ Email        ├────────────►│ Create       │
     │ verified?    │             │ PENDING      │
     └──────┬───────┘             │ referral     │
            │ YES                 └──────────────┘
            ▼
     ┌──────────────┐
     │ Create       │
     │ COMPLETED    │
     │ referral     │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ +500 credits │
     │ to referrer  │
     │ primary org  │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ +500 credits │
     │ to referred  │
     │ primary org  │
     └──────┬───────┘
            │
            ▼
        SUCCESS

Note: 500 = REFERRAL.CREDITS constant from @webalive/shared
```

---

## Security Measures

| Risk | Mitigation |
|------|------------|
| **Spam invite emails** | Rate limit: 10 emails/day per user |
| **Code enumeration** | All validation failures return generic "Invalid code" |
| **Credit farming** | Require email verification before awarding credits |
| **Self-referral** | Check referrer_id !== referred_id |
| **Double referral** | UNIQUE constraint on referred_id |
| **Race condition** | Atomic DB function `get_or_create_invite_code()` handles all edge cases |
| **Existing user exploit** | Reject users created > 24h ago |
| **Pending referral stale** | Workstream 11 completes on email verification |
| **localStorage manipulation** | Code readable by any JS on page - low risk since redemption validates server-side |
| **Malformed JSON body** | All POST endpoints wrap `req.json()` in try/catch |
| **Partial credit award** | Each add_credits RPC is atomic; cross-user failures logged for reconciliation |

---

## Implementation Order

> **Note:** Workstreams are numbered by logical grouping, not implementation order. Follow the order below when building.

1. **Supabase Schema** (Workstream 5) - Must be first
2. **Invite Code Generator** (Workstream 2) - Pure function, no deps
3. **Landing Page** (Workstream 1) - Standalone
4. **GET /api/referrals/me** (Workstream 6) - Needs schema
5. **POST /api/referrals/redeem** (Workstream 7) - Needs schema
6. **Complete Pending** (Workstream 11) - Needs schema + redeem
7. **Post-Signup Hook** (Workstream 10) - Needs redeem API
8. **InviteModal Integration** (Workstream 3) - Needs /me API
9. **Loops.so Email** (Workstream 4) - Can be parallel
10. **POST /api/referrals/send-invite** (Workstream 8) - Needs Loops
11. **GET /api/referrals/history** (Workstream 9) - Nice to have

---

## Testing Checklist

- [ ] Visit `/invite/ABC123` → code stored in `alive_referral` with 30-day expiry
- [ ] Code expires after 30 days
- [ ] New user signup → referral redeemed
- [ ] Email not verified → referral pending
- [ ] Self-referral blocked (returns generic error)
- [ ] Already-referred user blocked (returns generic error)
- [ ] Invalid code ignored gracefully (returns generic error)
- [ ] Existing user (>24h old) cannot redeem (returns generic error)
- [ ] Credits awarded to correct orgs
- [ ] Email rate limit works (10/day)
- [ ] Duplicate email invite blocked
- [ ] Race condition on invite code generation handled
- [ ] Pending referral completed via Workstream 11
- [ ] Users without org get warning logged (credits not awarded)

---

## API Test Specifications

**MANDATORY**: Per CLAUDE.md, security-critical endpoints require tests.

### Test Mock Utilities

> **File to create:** `apps/web/lib/test-helpers/request-mocks.ts`

All test files import mock utilities from the existing test-helpers directory:

```typescript
// apps/web/lib/test-helpers/request-mocks.ts — CREATE THIS FILE

import { NextRequest } from "next/server"

/**
 * Creates a mock Request with JSON body (no authentication)
 */
export function mockRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

/**
 * Creates a mock Request that will throw when .json() is called
 */
export function mockRequestWithMalformedJson(): Request {
  const req = new Request("http://localhost:3000/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not valid json {{{",
  })
  return req
}

/**
 * Mock options for authenticated requests
 */
interface MockAuthOptions {
  userAge?: "1d" | "2d" | "7d"      // User account age
  emailVerified?: boolean           // Is email verified
  alreadyReferred?: boolean         // Already has referral record
  emailsSentToday?: number          // Email invite count today
  alreadySent?: boolean             // Already sent to this email
}

/**
 * Creates a mock Request with authentication context.
 * In tests, you'll need to mock getSessionUser() to return the test user.
 */
export function mockAuthenticatedRequest(
  body: Record<string, unknown>,
  _options?: MockAuthOptions  // Options are for test setup, not the request itself
): Request {
  // The request itself is just a regular request - authentication is mocked via jest.mock
  return mockRequest(body)
}

// Example usage in test file:
//
// jest.mock("@/features/auth/lib/auth", () => ({
//   getSessionUser: jest.fn().mockResolvedValue({ id: "test_user_123" }),
// }))
//
// jest.mock("@/lib/supabase/iam", () => ({
//   createIamClient: jest.fn().mockResolvedValue({
//     from: jest.fn().mockReturnValue({
//       select: jest.fn().mockReturnThis(),
//       eq: jest.fn().mockReturnThis(),
//       single: jest.fn().mockResolvedValue({ data: { /* mock data */ }, error: null }),
//     }),
//     rpc: jest.fn().mockResolvedValue({ data: 500, error: null }),
//   }),
// }))
```

---

### POST /api/referrals/redeem

```typescript
// apps/web/app/api/referrals/redeem/__tests__/route.test.ts

import { POST } from "../route"
import { REFERRAL } from "@webalive/shared"
import {
  mockRequest,
  mockAuthenticatedRequest,
  mockRequestWithMalformedJson,
} from "@/lib/test-helpers/request-mocks"

describe("POST /api/referrals/redeem", () => {
  // Auth tests
  it("returns 401 when not authenticated", async () => {
    const req = mockRequest({ code: "ABC123" })
    const res = await POST(req)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false, error: "Unauthorized" })
  })

  // Input validation
  it("returns 400 for malformed JSON body", async () => {
    const req = mockRequestWithMalformedJson()
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false, error: "Invalid JSON body" })
  })

  it("returns 400 for missing code", async () => {
    const req = mockAuthenticatedRequest({})
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  // Security tests - all return same generic error
  it("returns generic error for invalid code", async () => {
    const req = mockAuthenticatedRequest({ code: "INVALID" })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false, error: "Invalid code" })
  })

  it("returns generic error for self-referral", async () => {
    // Setup: user trying to redeem their own code
    const req = mockAuthenticatedRequest({ code: "OWN_CODE" })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false, error: "Invalid code" })
  })

  it("returns generic error for user >24h old", async () => {
    // Setup: user created 2 days ago
    const req = mockAuthenticatedRequest({ code: "VALID" }, { userAge: "2d" })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false, error: "Invalid code" })
  })

  it("returns generic error for already-referred user", async () => {
    // Setup: user already has referral record
    const req = mockAuthenticatedRequest({ code: "VALID" }, { alreadyReferred: true })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false, error: "Invalid code" })
  })

  // Happy paths
  it("creates pending referral when email not verified", async () => {
    const req = mockAuthenticatedRequest({ code: "VALID" }, { emailVerified: false })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.status).toBe("pending")
  })

  it("creates completed referral and awards credits", async () => {
    const req = mockAuthenticatedRequest({ code: "VALID" }, { emailVerified: true })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.data.status).toBe("completed")
    expect(json.data.creditsAwarded).toBe(REFERRAL.CREDITS)
  })
})
```

### POST /api/referrals/send-invite

```typescript
// apps/web/app/api/referrals/send-invite/__tests__/route.test.ts

import { POST } from "../route"
import {
  mockRequest,
  mockAuthenticatedRequest,
} from "@/lib/test-helpers/request-mocks"

describe("POST /api/referrals/send-invite", () => {
  it("returns 401 when not authenticated", async () => {
    const req = mockRequest({ email: "test@example.com" })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it("returns 400 for invalid email format", async () => {
    const invalidEmails = ["@", "test@", "@example.com", "test", ""]
    for (const email of invalidEmails) {
      const req = mockAuthenticatedRequest({ email })
      const res = await POST(req)
      expect(res.status).toBe(400)
    }
  })

  it("returns 429 when rate limit exceeded", async () => {
    // Setup: user has sent 10 emails today
    const req = mockAuthenticatedRequest({ email: "new@example.com" }, { emailsSentToday: 10 })
    const res = await POST(req)
    expect(res.status).toBe(429)
  })

  it("returns 400 for duplicate email invite", async () => {
    const req = mockAuthenticatedRequest({ email: "already@sent.com" }, { alreadySent: true })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("successfully sends invite email", async () => {
    const req = mockAuthenticatedRequest({ email: "new@example.com" })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
```

### POST /api/referrals/complete-pending

```typescript
// apps/web/app/api/referrals/complete-pending/__tests__/route.test.ts

import { POST } from "../route"
import { REFERRAL } from "@webalive/shared"
import { mockRequest } from "@/lib/test-helpers/request-mocks"

describe("POST /api/referrals/complete-pending", () => {
  it("returns 401 for invalid webhook secret", async () => {
    const req = mockRequest({ userId: "user_123", secret: "wrong" })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it("returns 400 for missing userId", async () => {
    const req = mockRequest({ secret: process.env.INTERNAL_WEBHOOK_SECRET })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns ok:false when no pending referral exists", async () => {
    const req = mockRequest({
      userId: "user_no_pending",
      secret: process.env.INTERNAL_WEBHOOK_SECRET
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: false, error: "No pending referral" })
  })

  it("completes pending referral and awards credits", async () => {
    // Setup: user has pending referral
    const req = mockRequest({
      userId: "user_with_pending",
      secret: process.env.INTERNAL_WEBHOOK_SECRET
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.data.creditsAwarded).toBe(REFERRAL.CREDITS)
  })
})
```

---

## Webhook Testing Guide

### Local Testing with curl

```bash
# 1. Set the secret in your .env.local
echo "INTERNAL_WEBHOOK_SECRET=test_secret_123" >> .env.local

# 2. Restart dev server
bun run dev

# 3. Test complete-pending endpoint
curl -X POST http://localhost:3000/api/referrals/complete-pending \
  -H "Content-Type: application/json" \
  -d '{"userId": "user_123", "secret": "test_secret_123"}'

# Expected: {"ok":false,"error":"No pending referral"} (if no pending)
# Expected: {"ok":true,"data":{"referralId":"...","creditsAwarded":500}} (if pending exists)
# Note: 500 = REFERRAL.CREDITS constant from @webalive/shared

# 4. Test with wrong secret
curl -X POST http://localhost:3000/api/referrals/complete-pending \
  -H "Content-Type: application/json" \
  -d '{"userId": "user_123", "secret": "wrong_secret"}'

# Expected: {"ok":false,"error":"Unauthorized"} with status 401
```

### Integration Testing with Auth Provider

When connecting to your auth provider's email verification webhook:

1. **Get the webhook URL**: `https://your-domain.com/api/referrals/complete-pending`
2. **Configure the secret** in both your `.env` and auth provider dashboard
3. **Test flow**:
   - Create a user with a pending referral
   - Trigger email verification in your auth provider
   - Verify the webhook was called (check server logs)
   - Verify referral status changed to "completed"
   - Verify credits were awarded

### Debugging Tips

```bash
# Check server logs for referral events
journalctl -u alive-dev -f | grep "\\[Referral\\]"

# Query database for referral status
supabase db run "SELECT * FROM iam.referrals WHERE referred_id = 'user_123'"

# Query database for credit balance
supabase db run "SELECT credits FROM iam.orgs WHERE org_id = 'org_123'"
```

---

## Monitoring & Alerting

**Key metrics to track:**

```sql
-- Daily referral success rate
SELECT
  DATE(created_at) as date,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'failed') as failed
FROM iam.referrals
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Stuck pending referrals (older than 7 days)
SELECT * FROM iam.referrals
WHERE status = 'pending' AND created_at < NOW() - INTERVAL '7 days';

-- Partial credit awards (logged errors)
-- Search logs for: "[Referral] Partial credit award"
```

**Alerting recommendations:**
- Alert if pending referrals > 100 (email verification may be broken)
- Alert if failed referrals spike (credit system may be down)
- Weekly report of total credits awarded via referrals

---

## Admin Tooling

**Manual referral operations** (run in Supabase SQL Editor):

```sql
-- Complete a stuck pending referral manually
UPDATE iam.referrals
SET status = 'completed', completed_at = NOW()
WHERE id = 'referral_uuid_here';

-- Void a referral (e.g., fraud detected)
UPDATE iam.referrals
SET status = 'failed'
WHERE id = 'referral_uuid_here';

-- Award credits manually after partial failure
SELECT iam.add_credits('org_id_here', 500);

-- Check a user's referral status
SELECT r.*,
  referrer.email as referrer_email,
  referred.email as referred_email
FROM iam.referrals r
JOIN iam.users referrer ON r.referrer_id = referrer.user_id
JOIN iam.users referred ON r.referred_id = referred.user_id
WHERE r.referred_id = 'user_id_here';
```

**Future admin API** (not in MVP):
- `POST /api/admin/referrals/:id/complete` - Force complete a pending referral
- `POST /api/admin/referrals/:id/void` - Void a fraudulent referral
- `GET /api/admin/referrals/stats` - Dashboard metrics

---

## Deployment Checklist

Before deploying to production:

- [ ] Run all migrations (`bun run db:migrate`)
- [ ] Set all env vars in production:
  - `NEXT_PUBLIC_BASE_URL`
  - `LOOPS_API_KEY`
  - `INTERNAL_WEBHOOK_SECRET` (generate with `openssl rand -hex 32`)
- [ ] Configure `apps/web/config/emails.ts` with production Loops template ID
- [ ] Regenerate database types (`bun run gen:db`)
- [ ] Export `generateInviteCode` from `@webalive/shared`
- [ ] Run unit tests (`bun run test`)
- [ ] Test complete flow manually on staging
- [ ] Configure email verification webhook in auth provider
- [ ] Monitor logs for first few referrals

---

## Implementation Notes

### Improvements Over Original Spec

| Component | Spec | Actual |
|-----------|------|--------|
| `useRedeemReferral` | `useRef` | `sessionStorage` (React 18 Strict Mode fix) |
| `/api/referrals/history` | No pagination | `limit`/`offset`/`hasMore` params |
| `/api/referrals/redeem` | No race handling | Catches unique constraint errors (code 23505) |
| `/api/referrals/complete-pending` | Mark completed → credits | Credits first → mark completed (safer) |
| `InviteModal` email validation | `includes("@")` | Regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` |
| `lib/referral.ts` | Partial try-catch | Full try-catch on all localStorage calls |

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_APP_URL` | Base URL for invite links (uses existing var, not new `BASE_URL`) |
| `LOOPS_API_KEY` | Loops.so API authentication |
| `INTERNAL_WEBHOOK_SECRET` | Auth for `/api/referrals/complete-pending` |

### MVP Simplification

For MVP, `email_verified = true` is set automatically on user creation (4 locations):
- `app/api/auth/signup/route.ts`
- `lib/deployment/domain-registry.ts`
- `app/api/test/bootstrap-tenant/route.ts`
- `lib/test-helpers/auth-test-helper.ts`

This allows referrals to complete immediately without email verification webhook integration.
