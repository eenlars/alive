/**
 * Gmail Send API
 *
 * Sends an email via Gmail API when user clicks Send button.
 * Uses stored OAuth token from user's Gmail connection.
 */

import { auth as gauth, gmail_v1 } from "@googleapis/gmail"
import { type NextRequest, NextResponse } from "next/server"
import { createErrorResponse, getSessionUser } from "@/features/auth/lib/auth"
import { ErrorCodes } from "@/lib/error-codes"
import { getOAuthInstance } from "@/lib/oauth/oauth-instances"
import type { GmailSendResponse } from "@/lib/types/gmail-api"

interface SendEmailRequest {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  body: string
  threadId?: string
}

interface CreateRawEmailParams extends SendEmailRequest {
  from: string
  fromName?: string
}

/**
 * RFC 2047 encode a header value if it contains non-ASCII characters.
 */
function encodeMimeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`
}

function formatFromAddress(email: string, displayName?: string): string {
  if (!displayName) return `<${email}>`
  // Encode display name if it contains non-ASCII
  return `${encodeMimeHeader(displayName)} <${email}>`
}

function createRawEmail(params: CreateRawEmailParams): string {
  const { from, fromName, to, cc, bcc, subject, body } = params

  const headers = [
    `From: ${formatFromAddress(from, fromName)}`,
    `To: ${to.join(", ")}`,
    cc?.length ? `Cc: ${cc.join(", ")}` : null,
    bcc?.length ? `Bcc: ${bcc.join(", ")}` : null,
    `Subject: ${encodeMimeHeader(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ]
    .filter(Boolean)
    .join("\r\n")

  // Base64url encode
  return Buffer.from(headers).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const user = await getSessionUser()
    if (!user) {
      return createErrorResponse(ErrorCodes.UNAUTHORIZED, 401)
    }

    // 2. Parse request body
    const body: SendEmailRequest = await req.json()
    if (!body.to?.length || !body.subject || !body.body) {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
        reason: "Missing required fields: to, subject, body",
      })
    }

    // 3. Get Gmail OAuth token
    const oauthManager = getOAuthInstance("google")
    let accessToken: string
    try {
      accessToken = await oauthManager.getAccessToken(user.id, "google")
    } catch (error) {
      console.error("[Gmail Send] Failed to get OAuth token:", error)
      return createErrorResponse(ErrorCodes.INTEGRATION_ERROR, 403, {
        reason: "Gmail not connected. Please connect Gmail in Settings.",
      })
    }

    // 4. Create Gmail client
    const oauth2Client = new gauth.OAuth2()
    oauth2Client.setCredentials({ access_token: accessToken })
    const gmail = new gmail_v1.Gmail({ auth: oauth2Client })

    // 5. Get sender's email and display name from Gmail sendAs settings
    const profileResponse = await gmail.users.getProfile({ userId: "me" })
    const senderEmail = profileResponse.data.emailAddress
    if (!senderEmail) {
      return createErrorResponse(ErrorCodes.INTEGRATION_ERROR, 500, {
        reason: "Could not determine sender email address",
      })
    }

    // Get display name from sendAs config (the name shown in "From:" field)
    let senderName: string | undefined
    try {
      const sendAsResponse = await gmail.users.settings.sendAs.list({ userId: "me" })
      const primarySendAs = sendAsResponse.data.sendAs?.find(s => s.isPrimary || s.sendAsEmail === senderEmail)
      senderName = primarySendAs?.displayName || undefined
    } catch {
      // Non-critical: continue without display name
      console.warn("[Gmail Send] Could not fetch sendAs settings for display name")
    }

    // 6. Send email with proper From header (includes display name)
    const raw = createRawEmail({ ...body, from: senderEmail, fromName: senderName })
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw,
        threadId: body.threadId,
      },
    })

    console.log(`[Gmail Send] Email sent by user ${user.id}, ID: ${response.data.id}`)

    if (!response.data.id) {
      return createErrorResponse(ErrorCodes.INTEGRATION_ERROR, 500, {
        reason: "Gmail API did not return message ID",
      })
    }

    const result: GmailSendResponse = {
      ok: true,
      messageId: response.data.id,
      threadId: response.data.threadId || undefined,
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("[Gmail Send] Error:", error)
    const message = error instanceof Error ? error.message : "Failed to send email"
    return createErrorResponse(ErrorCodes.INTEGRATION_ERROR, 500, { reason: message })
  }
}
