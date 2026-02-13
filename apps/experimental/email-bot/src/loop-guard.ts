import type { ParsedEmail } from "./types.js"

/**
 * Anti-loop protection for email bot.
 *
 * Blocks:
 * - Bounce addresses (mailer-daemon, postmaster, noreply, etc.)
 * - Own mailbox addresses (prevent self-replies)
 * - Auto-submitted emails (vacation, auto-reply headers)
 * - Known "out of office" / delivery failure subjects
 * - Rate limit: max 5 replies per sender per hour
 * - Max conversation depth: 20 messages
 */

const BLOCKED_SENDERS = new Set([
  "mailer-daemon",
  "postmaster",
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "bounce",
  "abuse",
])

const BLOCKED_SUBJECT_PATTERNS = [
  /out of office/i,
  /automatic reply/i,
  /auto[- ]?reply/i,
  /delivery (status|failure|notification)/i,
  /undeliverable/i,
  /returned mail/i,
  /mail delivery (failed|subsystem)/i,
  /failure notice/i,
]

/** Rate limit: sender -> timestamps of recent replies */
const replyTimestamps = new Map<string, number[]>()
const MAX_REPLIES_PER_HOUR = 5
const HOUR_MS = 60 * 60 * 1000

/** Set of own mailbox addresses (populated at startup) */
const ownAddresses = new Set<string>()

export function registerOwnAddress(email: string): void {
  ownAddresses.add(email.toLowerCase())
}

export interface LoopGuardResult {
  allowed: boolean
  reason?: string
}

export function checkLoopGuard(email: ParsedEmail, conversationDepth: number): LoopGuardResult {
  const senderLower = email.from.toLowerCase()
  const senderLocal = senderLower.split("@")[0] ?? ""

  // 1. Block known bounce/system addresses
  if (BLOCKED_SENDERS.has(senderLocal)) {
    return { allowed: false, reason: `Blocked sender local part: ${senderLocal}` }
  }

  // 2. Block empty sender (bounce)
  if (!email.from.trim()) {
    return { allowed: false, reason: "Empty sender (bounce)" }
  }

  // 3. Block own addresses
  if (ownAddresses.has(senderLower)) {
    return { allowed: false, reason: `Sender is own address: ${senderLower}` }
  }

  // 4. Block auto-submitted emails
  if (email.autoHeaders.autoSubmitted && email.autoHeaders.autoSubmitted !== "no") {
    return { allowed: false, reason: `Auto-Submitted: ${email.autoHeaders.autoSubmitted}` }
  }

  // 5. Block X-Auto-Response-Suppress
  if (email.autoHeaders.autoResponseSuppress) {
    return { allowed: false, reason: `X-Auto-Response-Suppress: ${email.autoHeaders.autoResponseSuppress}` }
  }

  // 6. Block bulk/list precedence
  if (email.autoHeaders.precedence) {
    const prec = email.autoHeaders.precedence.toLowerCase()
    if (prec === "bulk" || prec === "list" || prec === "junk") {
      return { allowed: false, reason: `Precedence: ${prec}` }
    }
  }

  // 7. Block known auto-reply subjects
  for (const pattern of BLOCKED_SUBJECT_PATTERNS) {
    if (pattern.test(email.subject)) {
      return { allowed: false, reason: `Blocked subject pattern: ${email.subject}` }
    }
  }

  // 8. Max conversation depth
  if (conversationDepth >= 20) {
    return { allowed: false, reason: `Conversation too deep: ${conversationDepth} messages` }
  }

  // 9. Rate limit per sender
  const now = Date.now()
  const timestamps = replyTimestamps.get(senderLower) ?? []
  const recentTimestamps = timestamps.filter(t => now - t < HOUR_MS)
  if (recentTimestamps.length >= MAX_REPLIES_PER_HOUR) {
    return { allowed: false, reason: `Rate limited: ${recentTimestamps.length} replies to ${senderLower} in last hour` }
  }

  return { allowed: true }
}

/** Record that we sent a reply to this sender */
export function recordReply(sender: string): void {
  const key = sender.toLowerCase()
  const timestamps = replyTimestamps.get(key) ?? []
  timestamps.push(Date.now())
  // Prune old entries
  const cutoff = Date.now() - HOUR_MS
  replyTimestamps.set(
    key,
    timestamps.filter(t => t > cutoff),
  )
}
