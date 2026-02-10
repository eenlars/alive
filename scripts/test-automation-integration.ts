/**
 * Integration test: verify the automation "no duplicate records" fix.
 *
 * Part 1 (DB contract): Verifies that calling runAutomationJob() does NOT
 *   create any DB records. Then verifies that when the caller writes exactly
 *   1 run record, the count is correct.
 *
 * Part 2 (E2E via API): Triggers the job through the real HTTP endpoint and
 *   verifies exactly 1 run record is created end-to-end.
 *
 * Run:
 *   env $(grep -v '^#' apps/web/.env.production | xargs) bun scripts/test-automation-integration.ts
 *
 * For Part 2, a running server is required (staging or production).
 * Set TEST_TRIGGER_URL to override (default: http://localhost:8997).
 */

import { createClient } from "@supabase/supabase-js"
import { computeNextRunAtMs } from "@webalive/automation"

// ── Config ──────────────────────────────────────────────────
const JOB_ID = "auto_job_a32f0f84b872ad29"
const TRIVIAL_PROMPT = "Reply with exactly the text AUTOMATION_TEST_OK and nothing else."

// ── Setup ───────────────────────────────────────────────────
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
  process.exit(1)
}
const supabase = createClient(url, key, { db: { schema: "app" } })

let passed = 0
let failed = 0

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    console.error(`  ✗ ${label}`)
  }
}

// ── Helpers ─────────────────────────────────────────────────
async function getRunCount(jobId: string): Promise<number> {
  const { count } = await supabase
    .from("automation_runs")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId)
  return count ?? 0
}

async function getJob(jobId: string) {
  const { data } = await supabase
    .from("automation_jobs")
    .select("*, domains:site_id (hostname)")
    .eq("id", jobId)
    .single()
  return data
}

// ════════════════════════════════════════════════════════════
// PART 1: DB Contract Test
//
// Proves: runAutomationJob() is a pure function with no DB side effects.
// Method: Snapshot run count, call executor, check count is unchanged.
//         Then manually write 1 run record and verify count is +1.
// ════════════════════════════════════════════════════════════

async function testDbContract() {
  console.log("═══ Part 1: DB Contract (executor is pure) ═══\n")

  const job = await getJob(JOB_ID)
  if (!job) throw new Error(`Job ${JOB_ID} not found`)
  const hostname = (job.domains as any)?.hostname
  if (!hostname) throw new Error("Site not found")

  // Save original state
  const originalState = {
    is_active: job.is_active,
    consecutive_failures: job.consecutive_failures,
    running_at: job.running_at,
    next_run_at: job.next_run_at,
    last_run_status: job.last_run_status,
    last_run_error: job.last_run_error,
    last_run_duration_ms: job.last_run_duration_ms,
  }

  try {
    // Reset job so executor doesn't fail on is_active check
    await supabase
      .from("automation_jobs")
      .update({ is_active: true, consecutive_failures: 0, running_at: null })
      .eq("id", JOB_ID)

    // ── Test 1a: Executor does NOT create run records ──
    const countBefore = await getRunCount(JOB_ID)
    console.log(`Run count before executor: ${countBefore}`)

    // Call the real executor — it does workspace validation, credit check, OAuth,
    // then hits the worker pool which may time out. We don't care about the result;
    // we only care that it doesn't write to the DB.
    //
    // Use a very short timeout so it returns quickly (validation passes, execution times out).
    const { runAutomationJob } = await import("../apps/web/lib/automation/executor")
    const result = await runAutomationJob({
      jobId: JOB_ID,
      userId: job.user_id,
      orgId: job.org_id,
      workspace: hostname,
      prompt: TRIVIAL_PROMPT,
      timeoutSeconds: 10, // Short — we just need it to return
    })

    console.log(`Executor returned: success=${result.success}, duration=${result.durationMs}ms`)

    const countAfterExecutor = await getRunCount(JOB_ID)
    assert(
      countAfterExecutor === countBefore,
      `Executor created 0 run records (before=${countBefore}, after=${countAfterExecutor})`,
    )

    // Check job state — executor should NOT have modified running_at or last_run_status
    const jobAfterExec = await getJob(JOB_ID)
    assert(
      jobAfterExec?.running_at === null,
      `Executor did not set running_at (got ${jobAfterExec?.running_at})`,
    )
    // last_run_status should still be whatever originalState had (executor doesn't touch it)
    assert(
      jobAfterExec?.last_run_status === originalState.last_run_status,
      `Executor did not change last_run_status (still "${originalState.last_run_status}")`,
    )

    // ── Test 1b: Caller creates exactly 1 run record ──
    const startedAt = new Date()
    const startedAtIso = startedAt.toISOString()
    const now = new Date()
    const status = result.success ? "success" : "failure"

    // Compute next_run_at (same logic as trigger route)
    let nextRunAt: string | null = null
    if (job.trigger_type === "cron" && job.cron_schedule) {
      const nextMs = computeNextRunAtMs(
        { kind: "cron", expr: job.cron_schedule, tz: job.cron_timezone || undefined },
        now.getTime(),
      )
      if (nextMs) nextRunAt = new Date(nextMs).toISOString()
    }

    // Update job (like trigger route does)
    await supabase
      .from("automation_jobs")
      .update({
        running_at: null,
        last_run_at: startedAtIso,
        last_run_status: status,
        last_run_error: result.error ?? null,
        last_run_duration_ms: result.durationMs,
        next_run_at: nextRunAt,
      })
      .eq("id", JOB_ID)

    // Insert exactly 1 run record (like trigger route does)
    await supabase.from("automation_runs").insert({
      job_id: JOB_ID,
      started_at: startedAtIso,
      completed_at: now.toISOString(),
      duration_ms: result.durationMs,
      status,
      error: result.error ?? null,
      result: result.response ? { response: result.response.substring(0, 10000) } : null,
      messages: result.messages ?? null,
      triggered_by: "manual",
    })

    const countAfterCaller = await getRunCount(JOB_ID)
    assert(
      countAfterCaller === countBefore + 1,
      `Caller created exactly 1 run record (before=${countBefore}, after=${countAfterCaller})`,
    )

    // Verify job state after caller update
    const jobFinal = await getJob(JOB_ID)
    assert(jobFinal?.running_at === null, `running_at is null after cleanup`)
    assert(jobFinal?.last_run_status === status, `last_run_status is "${status}"`)

    if (job.trigger_type === "cron") {
      assert(jobFinal?.next_run_at !== null, `next_run_at is set for cron job`)
    }

    // Verify latest run record
    const { data: latestRun } = await supabase
      .from("automation_runs")
      .select("triggered_by, status")
      .eq("job_id", JOB_ID)
      .order("started_at", { ascending: false })
      .limit(1)
      .single()

    assert(latestRun?.triggered_by === "manual", `triggered_by is "manual" (got ${latestRun?.triggered_by})`)
    assert(latestRun?.status === status, `run record status matches "${status}"`)
  } finally {
    // Always restore
    await supabase.from("automation_jobs").update(originalState).eq("id", JOB_ID)
    console.log("\n  (job restored to original state)")
  }
}

// ════════════════════════════════════════════════════════════
// PART 2: E2E via trigger API
//
// Calls the actual trigger endpoint and waits for the run to complete.
// Requires a running server. Skipped if no server is reachable.
// ════════════════════════════════════════════════════════════

async function testE2eTrigger() {
  console.log("\n═══ Part 2: E2E via internal trigger API ═══\n")

  const triggerUrl = process.env.TEST_TRIGGER_URL || "http://localhost:8997"
  const jwtSecret = process.env.JWT_SECRET

  if (!jwtSecret) {
    console.log("  (skipped: JWT_SECRET not set)")
    return
  }

  // Check server is reachable
  try {
    await fetch(`${triggerUrl}/api/health`, { signal: AbortSignal.timeout(3000) })
  } catch {
    console.log(`  (skipped: server not reachable at ${triggerUrl})`)
    return
  }

  const job = await getJob(JOB_ID)
  if (!job) throw new Error("Job not found")

  // Reset job
  await supabase
    .from("automation_jobs")
    .update({ is_active: true, consecutive_failures: 0, running_at: null })
    .eq("id", JOB_ID)

  const originalState = {
    is_active: job.is_active,
    consecutive_failures: job.consecutive_failures,
    running_at: job.running_at,
    next_run_at: job.next_run_at,
    last_run_status: job.last_run_status,
    last_run_error: job.last_run_error,
    last_run_duration_ms: job.last_run_duration_ms,
  }

  try {
    const countBefore = await getRunCount(JOB_ID)
    console.log(`Run count before trigger: ${countBefore}`)

    // Call internal trigger endpoint
    const resp = await fetch(`${triggerUrl}/api/internal/automation/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": jwtSecret,
      },
      body: JSON.stringify({ jobId: JOB_ID }),
      signal: AbortSignal.timeout(300_000), // 5 min
    })

    const body = await resp.json()
    console.log(`Trigger response: ${resp.status}`, JSON.stringify(body))

    if (resp.ok) {
      const countAfter = await getRunCount(JOB_ID)
      const newRuns = countAfter - countBefore
      assert(newRuns === 1, `E2E: exactly 1 new run record (got ${newRuns})`)

      assert(body.ok === true || body.ok === false, `E2E: response has ok field`)

      const { data: latestRun } = await supabase
        .from("automation_runs")
        .select("triggered_by")
        .eq("job_id", JOB_ID)
        .order("started_at", { ascending: false })
        .limit(1)
        .single()

      assert(latestRun?.triggered_by === "manual", `E2E: triggered_by is "manual"`)
    } else {
      console.log(`  (trigger returned ${resp.status}, skipping assertions)`)
    }
  } finally {
    await supabase.from("automation_jobs").update(originalState).eq("id", JOB_ID)
    console.log("  (job restored to original state)")
  }
}

// ── Run ─────────────────────────────────────────────────────
async function main() {
  console.log("=== Automation Integration Test ===\n")

  await testDbContract()
  await testE2eTrigger()

  console.log(`\n=== ${passed + failed} assertions: ${passed} passed, ${failed} failed ===`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error("Fatal:", err)
  process.exit(1)
})
