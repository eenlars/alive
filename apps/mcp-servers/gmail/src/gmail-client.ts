/**
 * Gmail API Client
 *
 * Wraps the Google Gmail API with Bearer token authentication.
 * Each request uses the access token passed via HTTP Authorization header.
 */

import { auth, gmail, type gmail_v1 } from "@googleapis/gmail"

/**
 * Create a Gmail client with the provided access token
 */
export function createGmailClient(accessToken: string): gmail_v1.Gmail {
  const oauth2Client = new auth.OAuth2()
  oauth2Client.setCredentials({ access_token: accessToken })

  return gmail({ version: "v1", auth: oauth2Client })
}

/**
 * Get user profile (email address)
 */
export async function getUserProfile(gmail: gmail_v1.Gmail): Promise<{ email: string; messagesTotal: number }> {
  const response = await gmail.users.getProfile({ userId: "me" })
  return {
    email: response.data.emailAddress || "unknown",
    messagesTotal: response.data.messagesTotal || 0,
  }
}

/**
 * Search emails with Gmail query syntax
 */
export async function searchEmails(
  gmail: gmail_v1.Gmail,
  query: string,
  maxResults: number = 10,
): Promise<EmailSummary[]> {
  const response = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults,
  })

  if (!response.data.messages) {
    return []
  }

  // Fetch details for each message
  const emails: EmailSummary[] = []
  for (const msg of response.data.messages) {
    if (!msg.id) continue
    const detail = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "metadata",
      metadataHeaders: ["From", "To", "Subject", "Date"],
    })

    const headers = detail.data.payload?.headers || []
    emails.push({
      id: msg.id,
      threadId: msg.threadId || "",
      from: getHeader(headers, "From"),
      to: getHeader(headers, "To"),
      subject: getHeader(headers, "Subject"),
      date: getHeader(headers, "Date"),
      snippet: detail.data.snippet || "",
      labelIds: detail.data.labelIds || [],
    })
  }

  return emails
}

/**
 * Get full email content
 */
export async function getEmail(gmail: gmail_v1.Gmail, messageId: string): Promise<EmailFull> {
  const response = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  })

  const headers = response.data.payload?.headers || []
  const body = extractBody(response.data.payload)

  return {
    id: response.data.id || messageId,
    threadId: response.data.threadId || "",
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    cc: getHeader(headers, "Cc"),
    subject: getHeader(headers, "Subject"),
    date: getHeader(headers, "Date"),
    snippet: response.data.snippet || "",
    body,
    labelIds: response.data.labelIds || [],
    attachments: extractAttachmentInfo(response.data.payload),
  }
}

/**
 * Send an email
 */
export async function sendEmail(
  gmail: gmail_v1.Gmail,
  to: string,
  subject: string,
  body: string,
  cc?: string,
  bcc?: string,
): Promise<{ id: string; threadId: string }> {
  const message = createMimeMessage(to, subject, body, cc, bcc)
  const encodedMessage = Buffer.from(message).toString("base64url")

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage,
    },
  })

  return {
    id: response.data.id || "",
    threadId: response.data.threadId || "",
  }
}

/**
 * Create a draft
 */
export async function createDraft(
  gmail: gmail_v1.Gmail,
  to: string,
  subject: string,
  body: string,
  cc?: string,
): Promise<{ id: string; messageId: string }> {
  const message = createMimeMessage(to, subject, body, cc)
  const encodedMessage = Buffer.from(message).toString("base64url")

  const response = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: {
        raw: encodedMessage,
      },
    },
  })

  return {
    id: response.data.id || "",
    messageId: response.data.message?.id || "",
  }
}

/**
 * List labels
 */
export async function listLabels(gmail: gmail_v1.Gmail): Promise<Label[]> {
  const response = await gmail.users.labels.list({ userId: "me" })
  return (response.data.labels || []).map(label => ({
    id: label.id || "",
    name: label.name || "",
    type: label.type || "user",
  }))
}

/**
 * Modify email labels (archive, trash, mark read/unread)
 */
export async function modifyLabels(
  gmail: gmail_v1.Gmail,
  messageId: string,
  addLabelIds: string[],
  removeLabelIds: string[],
): Promise<void> {
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      addLabelIds,
      removeLabelIds,
    },
  })
}

/**
 * Move to trash
 */
export async function trashEmail(gmail: gmail_v1.Gmail, messageId: string): Promise<void> {
  await gmail.users.messages.trash({ userId: "me", id: messageId })
}

/**
 * Permanently delete
 */
export async function deleteEmail(gmail: gmail_v1.Gmail, messageId: string): Promise<void> {
  await gmail.users.messages.delete({ userId: "me", id: messageId })
}

// Helper types
export interface EmailSummary {
  id: string
  threadId: string
  from: string
  to: string
  subject: string
  date: string
  snippet: string
  labelIds: string[]
}

export interface EmailFull extends EmailSummary {
  cc: string
  body: string
  attachments: AttachmentInfo[]
}

export interface AttachmentInfo {
  filename: string
  mimeType: string
  size: number
  attachmentId: string
}

export interface Label {
  id: string
  name: string
  type: string
}

// Helper functions

/**
 * Decode RFC 2047 MIME encoded-words in email headers.
 * Handles =?charset?B?base64?= and =?charset?Q?quoted-printable?= formats.
 * Also detects and fixes double-encoded UTF-8 (mojibake).
 */
function decodeMimeHeader(value: string): string {
  // RFC 2047 encoded-word pattern: =?charset?encoding?text?=
  const encodedWordPattern = /=\?([^?]+)\?(B|Q)\?([^?]*)\?=/gi

  let decoded = value.replace(encodedWordPattern, (_match, charset: string, encoding: string, text: string) => {
    const cs = charset.toLowerCase()
    const enc = encoding.toUpperCase()

    let bytes: Buffer
    if (enc === "B") {
      bytes = Buffer.from(text, "base64")
    } else {
      // Q encoding: underscores are spaces, =XX is hex
      const qDecoded = text
        .replace(/_/g, " ")
        .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
      bytes = Buffer.from(qDecoded, "binary")
    }

    if (cs === "utf-8" || cs === "utf8") {
      return bytes.toString("utf-8")
    }
    // For other charsets (iso-8859-1, windows-1252, etc.), latin1 is close enough
    return bytes.toString("latin1")
  })

  // Remove whitespace between adjacent encoded-words (RFC 2047 §6.2)
  decoded = decoded.replace(/\?=\s+=\?/g, "?==?")

  // Detect and fix double-encoded UTF-8 (mojibake)
  // Pattern: characters like Ã¢, Ã©, etc. that are UTF-8 bytes misread as Latin-1
  if (/[\xC0-\xDF][\x80-\xBF]|[\xE0-\xEF][\x80-\xBF]{2}/.test(decoded)) {
    try {
      const latin1Bytes = Buffer.from(decoded, "latin1")
      const reDecoded = latin1Bytes.toString("utf-8")
      // Verify it decoded cleanly (no replacement characters) and is shorter
      if (!reDecoded.includes("\uFFFD") && reDecoded.length < decoded.length) {
        return reDecoded
      }
    } catch {
      // Not double-encoded, return as-is
    }
  }

  return decoded
}

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[], name: string): string {
  const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase())
  if (!header?.value) return ""
  return decodeMimeHeader(header.value)
}

function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return ""

  // Simple text body
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8")
  }

  // Multipart - look for text/plain or text/html
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64url").toString("utf-8")
      }
    }
    // Fall back to HTML
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return Buffer.from(part.body.data, "base64url").toString("utf-8")
      }
    }
    // Recursive for nested multipart
    for (const part of payload.parts) {
      const nested = extractBody(part)
      if (nested) return nested
    }
  }

  return ""
}

function extractAttachmentInfo(payload: gmail_v1.Schema$MessagePart | undefined): AttachmentInfo[] {
  const attachments: AttachmentInfo[] = []
  if (!payload) return attachments

  function traverse(part: gmail_v1.Schema$MessagePart) {
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType || "application/octet-stream",
        size: part.body.size || 0,
        attachmentId: part.body.attachmentId,
      })
    }
    if (part.parts) {
      for (const p of part.parts) traverse(p)
    }
  }

  traverse(payload)
  return attachments
}

/**
 * RFC 2047 encode a header value if it contains non-ASCII characters.
 * Uses Base64 encoding with UTF-8 charset.
 */
function encodeMimeHeader(value: string): string {
  // Check if the string contains non-ASCII characters
  if (/^[\x20-\x7E]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`
}

function createMimeMessage(to: string, subject: string, body: string, cc?: string, bcc?: string): string {
  const lines = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    bcc ? `Bcc: ${bcc}` : null,
    `Subject: ${encodeMimeHeader(subject)}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ]
    .filter(Boolean)
    .join("\r\n")

  return lines
}
