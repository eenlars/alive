/**
 * Sync Automation Schedules to pg-boss
 *
 * On startup, reads active cron automation_jobs from Supabase
 * and registers them as pg-boss schedules.
 *
 * This replaces CronService's armTimer()/getNextWakeTime() logic.
 * pg-boss handles the timing, persistence, and crash recovery.
 */

import { createClient } from "@supabase/supabase-js"
import { scheduleAutomation } from "@webalive/job-queue"
import { z } from "zod"
import { getSupabaseCredentials } from "@/lib/env/server"

const AutomationJobRowSchema = z.object({
  id: z.string(),
  site_id: z.string(),
  user_id: z.string(),
  org_id: z.string(),
  trigger_type: z.enum(["cron", "webhook", "one-time"]),
  cron_schedule: z.string().nullable(),
  cron_timezone: z.string().nullable(),
  action_prompt: z.string().nullable(),
  action_timeout_seconds: z.number().nullable(),
  action_model: z.string().nullable(),
  action_thinking: z.string().nullable(),
  skills: z.array(z.string()).nullable(),
  is_active: z.boolean(),
  domains: z.object({ hostname: z.string() }).nullable(),
})

type AutomationJobRow = z.infer<typeof AutomationJobRowSchema>

/**
 * Sync all active cron automations from Supabase to pg-boss schedules.
 *
 * Called once at startup. When users create/update/delete automations
 * via the API, those routes should also call scheduleAutomation/unscheduleAutomation.
 */
export async function syncAutomationSchedules(): Promise<void> {
  const { url, key } = getSupabaseCredentials("service")
  const supabase = createClient(url, key, { db: { schema: "app" } })

  // Fetch all active cron automations with their site hostnames
  const { data: jobs, error } = await supabase
    .from("automation_jobs")
    .select(
      "id, site_id, user_id, org_id, trigger_type, cron_schedule, cron_timezone, action_prompt, action_timeout_seconds, action_model, action_thinking, skills, is_active, domains:site_id (hostname)",
    )
    .eq("is_active", true)
    .eq("trigger_type", "cron")
    .not("cron_schedule", "is", null)

  if (error) {
    console.error("[SyncSchedules] Failed to fetch automation jobs:", error)
    return
  }

  if (!jobs || jobs.length === 0) {
    console.log("[SyncSchedules] No active cron automations to sync")
    return
  }

  const parsedJobs = AutomationJobRowSchema.array().safeParse(jobs)
  if (!parsedJobs.success) {
    console.error("[SyncSchedules] Invalid automation_jobs response shape:", parsedJobs.error)
    return
  }

  let synced = 0
  let skipped = 0

  for (const job of parsedJobs.data satisfies AutomationJobRow[]) {
    if (!job.cron_schedule || !job.action_prompt) {
      skipped++
      continue
    }

    const hostname = job.domains?.hostname
    if (!hostname) {
      console.warn(`[SyncSchedules] Job ${job.id} has no associated hostname, skipping`)
      skipped++
      continue
    }

    try {
      const scheduled = await scheduleAutomation(
        `automation-${job.id}`,
        job.cron_schedule,
        {
          jobId: job.id,
          userId: job.user_id,
          orgId: job.org_id,
          workspace: hostname,
          prompt: job.action_prompt,
          timeoutSeconds: job.action_timeout_seconds || 300,
          model: job.action_model || undefined,
          thinkingPrompt: job.action_thinking || undefined,
          skills: job.skills || undefined,
          cronSchedule: job.cron_schedule,
          cronTimezone: job.cron_timezone || "UTC",
        },
        { tz: job.cron_timezone || "UTC" },
      )
      if (scheduled) {
        synced++
      } else {
        console.warn(`[SyncSchedules] Could not resolve next run for job ${job.id}, skipping`)
      }
    } catch (err) {
      console.error(`[SyncSchedules] Failed to schedule automation ${job.id}:`, err)
    }
  }

  console.log(`[SyncSchedules] Synced ${synced} automation(s), skipped ${skipped}`)
}
