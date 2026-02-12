import type { EmailDraft } from "@/components/email/types"

type PersistedEmailDraftStatus = Extract<EmailDraft["status"], "draft" | "saved" | "sent">

interface EmailDraftStatePatch {
  status: PersistedEmailDraftStatus
  id?: string
  threadId?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isEmailDraftLike(value: Record<string, unknown>): boolean {
  const toField = value.to ?? value.recipients
  const hasRecipients = Array.isArray(toField) ? toField.length > 0 : typeof toField === "string" && toField.length > 0
  return hasRecipients && ("subject" in value || "body" in value || "content" in value)
}

function applyDraftPatch(value: Record<string, unknown>, patch: EmailDraftStatePatch): Record<string, unknown> {
  return {
    ...value,
    status: patch.status,
    ...(patch.id ? { id: patch.id } : {}),
    ...(patch.threadId ? { threadId: patch.threadId } : {}),
  }
}

/**
 * Patch the email draft state embedded in a tool_result content payload.
 * Supports MCP wrappers like [{ type: "text", text: "{...json...}" }] and raw JSON/object payloads.
 */
export function patchEmailDraftToolResultContent(content: unknown, patch: EmailDraftStatePatch): unknown {
  if (Array.isArray(content)) {
    let didPatch = false
    const patched = content.map(item => {
      if (!isRecord(item) || item.type !== "text" || typeof item.text !== "string") {
        return item
      }
      const parsed = parseJsonRecord(item.text)
      if (!parsed || !isEmailDraftLike(parsed) || didPatch) {
        return item
      }
      didPatch = true
      return {
        ...item,
        text: JSON.stringify(applyDraftPatch(parsed, patch)),
      }
    })
    return didPatch ? patched : content
  }

  if (typeof content === "string") {
    const parsed = parseJsonRecord(content)
    if (!parsed || !isEmailDraftLike(parsed)) {
      return content
    }
    return JSON.stringify(applyDraftPatch(parsed, patch))
  }

  if (isRecord(content) && isEmailDraftLike(content)) {
    return applyDraftPatch(content, patch)
  }

  return content
}

export function toPersistedEmailDraftStatus(value: unknown): PersistedEmailDraftStatus {
  if (value === "draft" || value === "saved" || value === "sent") {
    return value
  }
  return "draft"
}
