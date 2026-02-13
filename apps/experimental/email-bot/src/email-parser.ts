import { randomUUID } from "node:crypto"
import { simpleParser } from "mailparser"
import type { ParsedEmail } from "./types.js"

/**
 * Parse a raw email buffer into our ParsedEmail structure.
 * Extracts threading headers (Message-ID, In-Reply-To, References)
 * and auto-reply detection headers.
 */
export async function parseEmail(raw: Buffer): Promise<ParsedEmail> {
  const parsed = await simpleParser(raw)

  const from = extractAddress(parsed.from?.value?.[0]?.address ?? "")
  const to = extractAddress(
    parsed.to
      ? ((Array.isArray(parsed.to) ? parsed.to[0]?.value?.[0]?.address : parsed.to.value?.[0]?.address) ?? "")
      : "",
  )

  // Extract threading headers
  const messageId = parsed.messageId ?? `<${randomUUID()}@fallback>`
  const rawInReplyTo = parsed.inReplyTo
  const inReplyTo = typeof rawInReplyTo === "string" ? rawInReplyTo : rawInReplyTo ? String(rawInReplyTo) : null
  const references = parseReferences(parsed.references)

  // Extract auto-reply detection headers
  const headers = parsed.headers
  const autoSubmitted = headers.get("auto-submitted")?.toString() ?? null
  const autoResponseSuppress = headers.get("x-auto-response-suppress")?.toString() ?? null
  const precedence = headers.get("precedence")?.toString() ?? null

  return {
    from,
    to,
    subject: parsed.subject ?? "(no subject)",
    textBody: parsed.text ?? "",
    htmlBody: parsed.html || null,
    messageId,
    inReplyTo,
    references,
    date: parsed.date ?? new Date(),
    autoHeaders: {
      autoSubmitted,
      autoResponseSuppress,
      precedence,
    },
  }
}

function extractAddress(raw: string | undefined): string {
  if (!raw) return ""
  // Strip angle brackets if present
  return raw.replace(/[<>]/g, "").trim().toLowerCase()
}

function parseReferences(refs: unknown): string[] {
  if (!refs) return []
  if (typeof refs === "string") {
    return refs
      .split(/\s+/)
      .map(r => r.trim())
      .filter(Boolean)
  }
  if (Array.isArray(refs)) {
    return refs.map(r => String(r).trim()).filter(Boolean)
  }
  return []
}
