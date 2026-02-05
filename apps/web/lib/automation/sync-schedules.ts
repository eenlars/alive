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
import { scheduleAutomation, unscheduleAutomation, getJobQueue } from "@webalive/job-queue"
import { getSupabaseCredentials } from "@/lib/env/server"

interface AutomationJobRow {
  id: string
  site_id: string
  user_id: string
  org_id: string
  trigger_type: "cron" | "webhook" | "one-time"
  cron_schedule: string | null
  cron_timezone: string | null
  action_prompt: string | null
  action_timeout_seconds: number | null
  action_model: string | null
  action_thinking: string | null
  skills: string[] | null
  is_active: boolean
  domains: { hostname: string } | null
}

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

  let synced = 0
  let skipped = 0

  for (const job of jobs as unknown as AutomationJobRow[]) {
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
