/**
 * Automation Notifications
 *
 * Sends email notifications when automation jobs are disabled due to repeated failures.
 * Uses localhost SMTP (Mailcow) for delivery.
 */

import type { RunContext } from "@webalive/automation-engine"
import nodemailer from "nodemailer"
import { createServiceIamClient } from "@/lib/supabase/service"

const FROM_ADDRESS = "noreply@alive.best"

/** Lazy-initialized SMTP transporter — localhost Mailcow relay on port 587 */
let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: "localhost",
      port: 587,
      secure: false,
      auth: {
        user: FROM_ADDRESS,
        pass: process.env.SMTP_NOREPLY_PASSWORD ?? "",
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
    const { data: user } = await iam.from("users").select("email").eq("id", ctx.job.user_id).single()

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
        `https://app.alive.best/chat?site=${ctx.hostname}&tab=automations`,
        "",
        "— Alive",
      ]
        .filter(Boolean)
        .join("\n"),
    })

    console.log(`[Notifications] Sent disabled-job email to ${user.email} for "${jobName}"`)
  } catch (err) {
    console.error(`[Notifications] Failed to send disabled-job email for "${ctx.job.name}":`, err)
  }
}
