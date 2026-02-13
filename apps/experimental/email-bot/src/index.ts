import { serve } from "@hono/node-server"
import { createClient } from "@supabase/supabase-js"
import { Hono } from "hono"
import { config } from "dotenv"
import path from "node:path"

// Load .env from the email-bot directory (suppress dotenv debug output)
config({ path: path.join(import.meta.dirname, "..", ".env"), debug: false })

import { registerOwnAddress } from "./loop-guard.js"
import { startWatcher, stopAllWatchers, watcherStatus } from "./imap-watcher.js"
import { closeDb } from "./conversation.js"
import type { EmailJob } from "./types.js"

const HEALTH_PORT = Number(process.env.HEALTH_PORT ?? "5071")
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
}

/** Password map: email -> password */
const passwords: Record<string, string> = {
  "dweil@mail.alive.best": process.env.MAILBOX_DWEIL_PASSWORD ?? "",
  "sopje@mail.alive.best": process.env.MAILBOX_SOPJE_PASSWORD ?? "",
  "spons@mail.alive.best": process.env.MAILBOX_SPONS_PASSWORD ?? "",
  "zeep@mail.alive.best": process.env.MAILBOX_ZEEP_PASSWORD ?? "",
}

/**
 * Load active email automation jobs from Supabase.
 */
async function loadEmailJobs(): Promise<EmailJob[]> {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    db: { schema: "app" },
  })

  const { data, error } = await supabase
    .from("automation_jobs")
    .select("id, name, email_address, action_prompt, action_model, site_id")
    .eq("trigger_type", "email")
    .eq("is_active", true)

  if (error) {
    throw new Error(`Failed to load email jobs: ${error.message}`)
  }

  return (data ?? []).map(row => ({
    id: row.id,
    name: row.name,
    emailAddress: row.email_address,
    actionPrompt: row.action_prompt ?? "",
    actionModel: row.action_model,
    siteId: row.site_id,
  }))
}

/**
 * Main startup: load jobs, register addresses, start IMAP watchers.
 */
async function main(): Promise<void> {
  console.log("[EmailBot] Starting...")

  // Load email jobs from database
  const jobs = await loadEmailJobs()
  console.log(`[EmailBot] Loaded ${jobs.length} email automation job(s)`)

  if (jobs.length === 0) {
    console.warn("[EmailBot] No active email jobs found. Waiting for health checks...")
  }

  // Register all own addresses for loop guard
  for (const job of jobs) {
    registerOwnAddress(job.emailAddress)
  }
  // Also register all known mailboxes even if no job yet
  for (const email of Object.keys(passwords)) {
    registerOwnAddress(email)
  }

  // Start IMAP watchers
  for (const job of jobs) {
    const password = passwords[job.emailAddress]
    if (!password) {
      console.error(`[EmailBot] No password configured for ${job.emailAddress}, skipping`)
      continue
    }
    console.log(`[EmailBot] Starting watcher for ${job.emailAddress} (job: "${job.name}")`)
    await startWatcher(job, password)
  }

  // Health check server
  const app = new Hono()

  app.get("/health", c => {
    const watchers: Record<string, unknown> = {}
    for (const [email, status] of watcherStatus) {
      watchers[email] = status
    }

    const allConnected = jobs.length > 0 && [...watcherStatus.values()].every(s => s.connected)

    return c.json({
      status: allConnected ? "healthy" : "degraded",
      uptime: process.uptime(),
      watchers,
      jobCount: jobs.length,
    })
  })

  serve({ fetch: app.fetch, port: HEALTH_PORT }, () => {
    console.log(`[EmailBot] Health server on :${HEALTH_PORT}`)
  })
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[EmailBot] SIGTERM received, shutting down...")
  await stopAllWatchers()
  closeDb()
  process.exit(0)
})

process.on("SIGINT", async () => {
  console.log("[EmailBot] SIGINT received, shutting down...")
  await stopAllWatchers()
  closeDb()
  process.exit(0)
})

main().catch(err => {
  console.error("[EmailBot] Fatal error:", err)
  process.exit(1)
})
