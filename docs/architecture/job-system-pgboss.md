# Job System: pg-boss + Triggers + Conversation Resumption

## Problem

The current automation system is fragile:

- **In-process scheduler** (`CronService`) uses `setTimeout` — dies on restart, no persistence
- **No conversation resumption** — Claude can't say "check back in 10 minutes"
- **No webhook triggers** — external events can't fire automations
- **No internal listeners** — deploy completions, file changes, etc. can't trigger jobs
- **Workspace-only targeting** — automations target a workspace, never a specific conversation thread

## Core Insight

When a user sends a chat message, the system already "picks up" a conversation:

```
1. Look up session (iam.sessions → sdk_session_id)
2. Send to Claude SDK with `resume: sessionId`
3. Stream back response
```

**A scheduled resumption is just an automated "Enter press."** The mechanism already exists — we just need a timer that triggers it reliably.

## Solution: pg-boss as Job Foundation

### Why pg-boss

| Requirement | pg-boss | Current CronService |
|---|---|---|
| Survives restarts | Yes (Postgres) | No (in-memory setTimeout) |
| Delayed jobs | `startAfter: 600` (seconds) | Manual `next_run_at` field |
| Cron schedules | Built-in `schedule()` | Custom `computeNextRunAtMs()` |
| Retries + backoff | Built-in `retryLimit`, `retryBackoff` | Manual `consecutive_failures` |
| Dead letter queue | Built-in `deadLetter` | None |
| Concurrent limits | Built-in `batchSize` per worker | Manual `maxConcurrent` check |
| Throttle/debounce | `sendThrottled()` / `sendDebounced()` | None |
| Pub/sub | `publish()` / `subscribe()` | None |
| Job inspection | `fetch()`, `getJobById()` | Query Supabase manually |
| Bun compatible | Yes (uses `pg` driver, ioredis not needed) | N/A |

**Key fit:** We already have Postgres (Supabase). No new infrastructure. pg-boss creates its own schema (`pgboss`) and manages its own tables.

### Connection

pg-boss needs a direct Postgres connection (not Supabase REST API). We can use the `DATABASE_URL` / pooler connection that Supabase provides:

```typescript
import { PgBoss } from 'pg-boss'

const boss = new PgBoss({
  connectionString: process.env.DATABASE_URL, // Supabase direct connection
  schema: 'pgboss',
  migrate: true,    // auto-creates tables on first start
  supervise: true,  // built-in maintenance (cleanup, scheduling)
  schedule: true,   // enable cron scheduling
})
```

---

## Architecture: Triggers → Queues → Workers

```
┌──────────────────────────────────────────────────────┐
│                     TRIGGERS                          │
│                                                       │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐            │
│  │Schedule  │  │ Webhook  │  │ Listener │            │
│  │(cron/    │  │ (HTTP    │  │ (internal│            │
│  │ delayed) │  │  POST)   │  │  events) │            │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘            │
│       │              │              │                  │
│       └──────────────┼──────────────┘                  │
│                      ▼                                 │
│              boss.send(queue, data)                    │
│              boss.sendAfter(queue, data, delay)        │
│              boss.schedule(queue, cron, data)          │
└──────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│                    QUEUES (pg-boss)                    │
│                                                       │
│  ┌────────────────────┐  ┌─────────────────────────┐ │
│  │ resume-conversation │  │ run-automation          │ │
│  │                     │  │                         │ │
│  │ { sessionKey,       │  │ { workspace,            │ │
│  │   message,          │  │   prompt,               │ │
│  │   userId,           │  │   userId,               │ │
│  │   workspace }       │  │   model }               │ │
│  └─────────┬───────────┘  └───────────┬─────────────┘ │
│            │                          │                │
│  ┌─────────────────────┐                              │
│  │ webhook-callback    │  (extensible — add more     │
│  │ { url, payload }    │   queues as needed)         │
│  └─────────┬───────────┘                              │
└────────────┼──────────────────────────┼───────────────┘
             │                          │
             ▼                          ▼
┌──────────────────────────────────────────────────────┐
│                     WORKERS                           │
│                                                       │
│  boss.work('resume-conversation', handler)            │
│  boss.work('run-automation', handler)                 │
│  boss.work('webhook-callback', handler)               │
└──────────────────────────────────────────────────────┘
```

---

## Trigger Types

### 1. Schedule Trigger

Replaces the current `CronService` entirely.

```typescript
// Cron schedule (replaces current automation_jobs.cron_schedule)
await boss.schedule('run-automation', '0 8 * * *', {
  workspace: 'example.alive.best',
  prompt: 'Check for broken links and fix them',
  userId: 'user-123',
  orgId: 'org-456',
}, { tz: 'Europe/Amsterdam' })

// Delayed one-shot (Claude says "check back in 10 minutes")
await boss.send('resume-conversation', {
  sessionKey: 'userId::workspace::tabGroupId::tabId',
  message: 'Continue — 10 minutes have passed since you scheduled this check-in.',
  userId: 'user-123',
  workspace: 'example.alive.best',
}, { startAfter: 600 }) // 600 seconds = 10 minutes
```

### 2. Webhook Trigger

External HTTP POST fires a job. A lightweight API endpoint receives the webhook and enqueues work:

```typescript
// POST /api/webhooks/:triggerId
export async function POST(req: NextRequest, { params }) {
  const { triggerId } = await params

  // Look up trigger config from DB
  const trigger = await getTriggerConfig(triggerId)
  if (!trigger) return Response.json({ error: 'Not found' }, { status: 404 })

  // Validate webhook secret (optional, per trigger)
  if (trigger.secret) {
    const sig = req.headers.get('x-webhook-signature')
    if (!verifySignature(sig, await req.text(), trigger.secret)) {
      return Response.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  // Enqueue the job
  const payload = await req.json()
  await boss.send(trigger.queue, {
    ...trigger.jobData,
    webhookPayload: payload,  // Pass webhook data to the job
  })

  return Response.json({ ok: true, queued: true })
}
```

**Use cases:**
- GitHub push → run code review automation
- Stripe payment → update site content
- External monitoring alert → trigger diagnostic automation
- Zapier/Make.com integration

### 3. Listener Trigger (Internal Events)

Uses pg-boss pub/sub. Internal system events publish to topics, subscribers enqueue jobs:

```typescript
// Publishing events (from anywhere in the codebase)
await boss.publish('site.deployed', {
  domain: 'newsite.alive.best',
  deployedBy: 'user-123',
})

await boss.publish('file.changed', {
  workspace: 'example.alive.best',
  path: '/user/src/index.ts',
  changeType: 'write',
})

await boss.publish('conversation.ended', {
  sessionKey: 'userId::workspace::tabGroupId::tabId',
  workspace: 'example.alive.best',
  userId: 'user-123',
})

// Subscribing to events (registered at startup)
// "When a site is deployed, run the SEO check automation"
await boss.subscribe('site.deployed', 'run-automation')
// The job data from the publish() call flows to the worker

// "When a conversation ends, schedule a follow-up in 1 hour"
await boss.subscribe('conversation.ended', 'schedule-followup')
```

---

## The "Sleep & Resume" MCP Tool

This is the feature that started this conversation: Claude calling a tool to schedule its own wake-up.

### MCP Tool Definition

```typescript
{
  name: 'schedule_resumption',
  description: 'Schedule this conversation to be resumed after a delay. Use when you need to wait for something (deploy, build, external process) before continuing.',
  input_schema: {
    type: 'object',
    properties: {
      delay_minutes: {
        type: 'number',
        description: 'Minutes to wait before resuming (1-1440, max 24 hours)',
      },
      reason: {
        type: 'string',
        description: 'Why you are scheduling this resumption (shown to user)',
      },
      resume_message: {
        type: 'string',
        description: 'Message to inject when conversation resumes (e.g., "Check if the deploy succeeded")',
      },
    },
    required: ['delay_minutes', 'reason'],
  },
}
```

### What Happens When Claude Calls It

```
1. Claude calls schedule_resumption({ delay_minutes: 10, reason: "Waiting for deploy" })
    │
2. Tool handler extracts current session context:
    │   - sessionKey (from active stream context)
    │   - userId, workspace, tabId, tabGroupId
    │
3. Enqueue delayed job:
    │   await boss.send('resume-conversation', {
    │     sessionKey,
    │     userId,
    │     workspace,
    │     message: resume_message || `Resuming: ${reason}`,
    │     reason,
    │     scheduledAt: new Date().toISOString(),
    │   }, { startAfter: delay_minutes * 60 })
    │
4. Return to Claude: "Scheduled resumption in 10 minutes."
    │
5. Current stream ends naturally (Claude finishes its response)
    │
6. UI shows: "⏰ Scheduled: Resuming in 10 minutes (Waiting for deploy)"
    │
7. [10 minutes pass — pg-boss persists this in Postgres, survives restarts]
    │
8. pg-boss worker picks up the job:
    │   boss.work('resume-conversation', async ([job]) => {
    │     // Same mechanism as a user pressing Enter
    │     await resumeConversation(job.data)
    │   })
    │
9. Worker calls POST /api/claude/stream internally:
    │   - Same session key → same conversation
    │   - Message: "Resuming: Waiting for deploy"
    │   - Claude picks up with full history
    │
10. User sees new messages appear in their chat UI
```

### The Resume Worker

```typescript
boss.work('resume-conversation', async ([job]) => {
  const { sessionKey, userId, workspace, message } = job.data

  // Look up the existing SDK session ID
  const sdkSessionId = await sessionStore.get(sessionKey)

  if (!sdkSessionId) {
    console.warn(`[ResumeWorker] No session found for ${sessionKey}, skipping`)
    return // Job completes (won't retry — session is gone)
  }

  // Call the same stream endpoint internally
  // This is equivalent to a user sending a message
  const response = await fetch(`${INTERNAL_BASE_URL}/api/claude/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Auth': INTERNAL_SECRET,  // Internal service auth
    },
    body: JSON.stringify({
      message,
      workspace,
      userId,
      tabId: extractTabId(sessionKey),
      tabGroupId: extractTabGroupId(sessionKey),
      isScheduledResumption: true,  // Flag for UI treatment
    }),
  })

  // Stream is consumed — response stored in session automatically
  // UI gets notified via SSE if user has the tab open

  if (!response.ok) {
    throw new Error(`Resume failed: ${response.status}`)
    // pg-boss will retry based on queue config
  }
})
```

---

## Migration Plan: CronService → pg-boss

### Phase 1: Install & Initialize pg-boss

```bash
bun add pg-boss
```

New package: `packages/job-queue/`

```typescript
// packages/job-queue/src/index.ts
import { PgBoss } from 'pg-boss'

let instance: PgBoss | null = null

export async function getJobQueue(): Promise<PgBoss> {
  if (instance) return instance

  instance = new PgBoss({
    connectionString: process.env.SUPABASE_DB_URL, // Direct Postgres connection
    schema: 'pgboss',
    migrate: true,
  })

  instance.on('error', console.error)
  await instance.start()

  return instance
}

export async function stopJobQueue(): Promise<void> {
  if (instance) {
    await instance.stop({ graceful: true, timeout: 30_000 })
    instance = null
  }
}
```

### Phase 2: Create Workers

```typescript
// packages/job-queue/src/workers/resume-conversation.ts
export async function registerResumeWorker(boss: PgBoss) {
  await boss.createQueue('resume-conversation', {
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 600, // 10 min max per resume attempt
    deadLetter: 'resume-failed',
  })

  await boss.createQueue('resume-failed') // Dead letter queue

  await boss.work('resume-conversation',
    { pollingIntervalSeconds: 5 },
    async ([job]) => {
      await handleResume(job.data)
    }
  )
}

// packages/job-queue/src/workers/run-automation.ts
export async function registerAutomationWorker(boss: PgBoss) {
  await boss.createQueue('run-automation', {
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 3600, // 1 hour max per automation
    deadLetter: 'automation-failed',
  })

  await boss.work('run-automation',
    { batchSize: 3, pollingIntervalSeconds: 10 },
    async (jobs) => {
      // Process up to 3 automations concurrently
      await Promise.all(jobs.map(job => runAutomationJob(job.data)))
    }
  )
}
```

### Phase 3: Migrate Existing Automations

```typescript
// Migration: move automation_jobs cron schedules to pg-boss
async function migrateExistingSchedules(boss: PgBoss) {
  const { data: activeJobs } = await supabase
    .from('automation_jobs')
    .select('*')
    .eq('is_active', true)
    .eq('trigger_type', 'cron')

  for (const job of activeJobs || []) {
    if (job.cron_schedule) {
      await boss.schedule('run-automation', job.cron_schedule, {
        jobId: job.id,
        workspace: job.hostname,
        prompt: job.action_prompt,
        userId: job.user_id,
        orgId: job.org_id,
      }, {
        tz: job.cron_timezone || 'UTC',
        key: `automation-${job.id}`, // Unique key per automation
      })
    }
  }
}
```

### Phase 4: Remove CronService

Once pg-boss is handling all scheduling:
- Delete `apps/web/lib/automation/cron-service.ts`
- Remove `startCronService()` call from `instrumentation.ts`
- Keep `executor.ts` (the actual prompt execution logic stays the same)
- Supabase `automation_jobs` table remains as the "config" store
- pg-boss handles all scheduling/timing/retry logic

---

## Webhook Trigger Infrastructure

### Database: `app.webhook_triggers`

```sql
create table app.webhook_triggers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references iam.users(id),
  org_id uuid not null,
  name text not null,
  -- What to do when triggered
  queue text not null,  -- 'run-automation', 'resume-conversation', etc.
  job_data jsonb not null default '{}',
  -- Security
  secret text,  -- HMAC secret for signature verification (nullable = no verification)
  -- Status
  is_active boolean not null default true,
  last_triggered_at timestamptz,
  trigger_count integer not null default 0,
  -- Metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### API Endpoint

```
POST /api/webhooks/:triggerId
```

Lightweight — validates signature (if configured), enqueues job, returns 200. No heavy processing in the request path.

---

## Listener Infrastructure

### Event Bus (pg-boss pub/sub)

```typescript
// Singleton event publisher
import { getJobQueue } from '@webalive/job-queue'

export async function emitEvent(topic: string, data: Record<string, unknown>) {
  const boss = await getJobQueue()
  await boss.publish(topic, data)
}
```

### Registering Listeners

```typescript
// At startup, register event → queue subscriptions
async function registerListeners(boss: PgBoss) {
  // When a site deploys, run post-deploy checks
  await boss.subscribe('site.deployed', 'run-automation')

  // When a conversation ends, optionally schedule follow-up
  await boss.subscribe('conversation.ended', 'check-followup')
}
```

### Emitting Events from Existing Code

Minimal changes — just add `emitEvent()` calls at key points:

```typescript
// In site-controller after deploy
await emitEvent('site.deployed', { domain, slug, port })

// In stream route after conversation completes
await emitEvent('conversation.ended', { sessionKey, workspace, userId })

// In file operations after write
await emitEvent('file.changed', { workspace, path, operation: 'write' })
```

---

## UI Considerations

### Scheduled Resumption State

When Claude schedules a resumption, the UI should show:

```
┌─────────────────────────────────────────┐
│ Chat: example.alive.best                │
│                                         │
│ [Claude]: I've started the deployment.  │
│ I'll check back in 10 minutes to        │
│ verify it succeeded.                    │
│                                         │
│ ⏰ Scheduled resumption in 10 minutes   │
│    Reason: Waiting for deploy           │
│    [Cancel]                             │
│                                         │
│ ─── 10 minutes later ──────────────── │
│                                         │
│ [System]: Resuming conversation         │
│ (scheduled 10 minutes ago)              │
│                                         │
│ [Claude]: The deployment completed      │
│ successfully. The site is now live at...│
└─────────────────────────────────────────┘
```

### Automation Dashboard

Replace current automation UI with pg-boss-backed data:

```typescript
// GET /api/jobs — list queued/active/completed jobs
const boss = await getJobQueue()
const queued = await boss.fetch('run-automation', { batchSize: 50, includeMetadata: true })
const schedules = await boss.getSchedules()
```

---

## Package Structure

```
packages/job-queue/
├── src/
│   ├── index.ts              # getJobQueue(), stopJobQueue()
│   ├── queues.ts             # Queue definitions and configs
│   ├── workers/
│   │   ├── resume-conversation.ts
│   │   ├── run-automation.ts
│   │   └── webhook-callback.ts
│   ├── triggers/
│   │   ├── schedule.ts       # Cron and delayed job helpers
│   │   ├── webhook.ts        # Webhook validation and enqueue
│   │   └── listener.ts       # Event subscription helpers
│   └── types.ts              # Shared types
├── package.json
└── tsconfig.json
```

Dependencies:
```json
{
  "dependencies": {
    "pg-boss": "^10.x"
  }
}
```

---

## Bun Compatibility

pg-boss uses the `pg` (node-postgres) driver internally. Bun has native `pg` support. Verified patterns:

- `PgBoss` constructor with connection string: works
- `boss.start()` / `boss.stop()`: works
- `boss.send()` / `boss.work()`: works
- `boss.schedule()`: works
- Schema migrations (`migrate: true`): works (uses standard SQL)

**Note:** pg-boss uses `LISTEN/NOTIFY` for real-time job pickup. Bun supports this through its `pg` compatibility layer. If issues arise, fall back to polling mode (`supervise: true` with `pollingIntervalSeconds`).

---

## What We Keep, What We Replace

| Component | Keep | Replace | Notes |
|---|---|---|---|
| `automation_jobs` table | Config store | Scheduling logic | Table becomes "automation definitions" |
| `automation_runs` table | Run history | - | Still log runs here |
| `executor.ts` | Core logic | - | Still runs prompts via worker pool |
| `cron-service.ts` | - | pg-boss scheduler | DELETE entirely |
| `validation.ts` | All validators | - | Still validate inputs |
| API routes | Keep structure | Internal logic | Routes now enqueue pg-boss jobs |
| `run-log.ts` | - | pg-boss job metadata | Job state lives in pgboss schema |
| Session store | All of it | - | Conversation resumption uses existing sessions |

---

## Implementation Order

1. **Create `packages/job-queue`** — pg-boss wrapper with connection setup
2. **Create `resume-conversation` queue + worker** — the "sleep & resume" feature
3. **Create `schedule_resumption` MCP tool** — Claude can call it
4. **Migrate cron automations to pg-boss** — replace CronService
5. **Add webhook trigger endpoint** — `/api/webhooks/:triggerId`
6. **Add internal event listeners** — pub/sub for deploy, file change, etc.
7. **UI: scheduled resumption indicator** — show countdown, cancel button
8. **UI: automation dashboard upgrade** — show pg-boss job states

Steps 1-3 are the MVP. Steps 4-8 build on top.
