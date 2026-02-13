/**
 * Automation Notifications
 *
 * Sends email notifications when automation jobs are disabled due to repeated failures.
 * Uses localhost SMTP (Mailcow) for delivery.
 */

import type { RunContext } from "@webalive/automation-engine"
import { DOMAINS, STREAM_ENV } from "@webalive/shared"
import nodemailer from "nodemailer"
import { createServiceIamClient } from "@/lib/supabase/service"

const FROM_ADDRESS = "noreply@alive.best"

function getAppBaseUrl(): string {
  const streamEnv = process.env.STREAM_ENV

  if (streamEnv === STREAM_ENV.STAGING) {
    return (DOMAINS.STREAM_STAGING || DOMAINS.STREAM_PROD || "https://app.alive.best").replace(/\/+$/, "")
  }

  if (streamEnv === STREAM_ENV.DEV || streamEnv === STREAM_ENV.LOCAL || streamEnv === STREAM_ENV.STANDALONE) {
    return (DOMAINS.STREAM_DEV || DOMAINS.STREAM_PROD || "https://app.alive.best").replace(/\/+$/, "")
  }

  return (DOMAINS.STREAM_PROD || "https://app.alive.best").replace(/\/+$/, "")
}

/** Lazy-initialized SMTP transporter — localhost Mailcow relay on port 587 */
let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    const smtpPassword = process.env.SMTP_NOREPLY_PASSWORD
    if (!smtpPassword) {
      throw new Error("SMTP_NOREPLY_PASSWORD is required for automation notifications")
    }
    transporter = nodemailer.createTransport({
      host: "localhost",
      port: 587,
      secure: false,
      auth: {
        user: FROM_ADDRESS,
        pass: smtpPassword,
      },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
    })
  }
  return transporter
}

/**
 * Notify the job owner that their automation has been disabled.
 * Best-effort — logs errors but never throws.
 */
export async function notifyJobDisabled(ctx: RunContext, error?: string): Promise<void> {
  try {
    const iam = createServiceIamClient()
    const { data: user, error: userError } = await iam.from("users").select("email").eq("id", ctx.job.user_id).single()

    if (userError) {
      console.error(`[Notifications] Failed to fetch email for user ${ctx.job.user_id}:`, userError)
      return
    }

    if (!user?.email) {
      console.warn(`[Notifications] No email found for user ${ctx.job.user_id}, skipping notification`)
      return
    }

    const jobName = ctx.job.name
    const failures = (ctx.job.consecutive_failures ?? 0) + 1

    await getTransporter().sendMail({
      from: `"Alive Automations" <${FROM_ADDRESS}>`,
      to: user.email,
      subject: `Automation "${jobName}" has been disabled`,
      text: [
        `Your automation "${jobName}" has been disabled after ${failures} consecutive failures.`,
        "",
        error ? `Last error: ${error}` : "",
        "",
        `Site: ${ctx.hostname}`,
        `Job ID: ${ctx.job.id}`,
        "",
        "You can re-enable it from the automations page:",
        `${getAppBaseUrl()}/chat?site=${ctx.hostname}&tab=automations`,
        "",
        "— Alive",
      ]
        .filter(Boolean)
        .join("\n"),
    })

    console.log(`[Notifications] Sent disabled-job email to user ${ctx.job.user_id} for "${jobName}"`)
  } catch (err) {
    console.error(`[Notifications] Failed to send disabled-job email for "${ctx.job.name}":`, err)
  }
}
