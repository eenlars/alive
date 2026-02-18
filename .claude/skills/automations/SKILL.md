---
name: Automations
description: Manage automation jobs — list, inspect, update, trigger, and debug. Query Supabase app.automation_jobs table.
---

# /automations

Manage automation jobs stored in Supabase `app.automation_jobs`.

## Connection

Use the Supabase REST API (NOT direct psql — the DB is hosted externally):

```bash
SUPABASE_URL="https://qnvprftdorualkdyogka.supabase.co"
SUPABASE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY /root/webalive/alive/apps/web/.env.production | cut -d= -f2)
```

All queries go through:
```bash
curl -s "${SUPABASE_URL}/rest/v1/automation_jobs?${QUERY}" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}"
```

## Common Operations

### List all automations
```bash
curl -s "${SUPABASE_URL}/rest/v1/automation_jobs?select=id,name,is_active,status,last_run_status,last_run_at,next_run_at,cron_schedule,trigger_type&order=created_at.desc" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}"
```

### Get full details of one automation
```bash
curl -s "${SUPABASE_URL}/rest/v1/automation_jobs?id=eq.${JOB_ID}&select=*" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}"
```

### Update an automation (PATCH)
```bash
curl -s -X PATCH "${SUPABASE_URL}/rest/v1/automation_jobs?id=eq.${JOB_ID}" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"field": "new_value"}'
```

Updatable fields: `name`, `description`, `action_prompt`, `cron_schedule`, `cron_timezone`, `is_active`, `action_model`, `action_timeout_seconds`, `skills`.

### Trigger a job manually
```bash
INTERNAL_SECRET=$(grep INTERNAL_SECRET /root/webalive/alive/apps/web/.env.production | cut -d= -f2)
curl -s -X POST "http://localhost:5070/trigger/${JOB_ID}" \
  -H "X-Internal-Secret: ${INTERNAL_SECRET}"
```

### Check worker health
```bash
curl -s http://localhost:5070/health
```

### View recent run logs
```bash
journalctl -u automation-worker -n 100 --no-pager | grep "${JOB_ID}"
```

## Table Schema (key columns)

| Column | Type | Description |
|--------|------|-------------|
| `id` | text | Job ID (e.g. `auto_job_xxx`) |
| `name` | text | Human-readable name |
| `site_id` | text | Domain/site this job belongs to |
| `trigger_type` | text | `cron`, `email`, or `webhook` |
| `cron_schedule` | text | Cron expression (if cron trigger) |
| `action_type` | text | `prompt` (Claude runs the prompt) |
| `action_prompt` | text | The full prompt Claude executes |
| `action_model` | text | Model override (null = default) |
| `is_active` | bool | Whether the job runs |
| `status` | text | `idle`, `running`, `paused` |
| `last_run_at` | timestamptz | Last execution time |
| `last_run_status` | text | `success`, `error`, `timeout` |
| `last_run_error` | text | Error message if failed |
| `next_run_at` | timestamptz | Next scheduled run |
| `email_address` | text | Email trigger address (if email trigger) |
| `consecutive_failures` | int | Failure count (resets on success) |

## Tips

- Always show a summary table when listing automations
- When updating prompts, show the diff of what changed
- To disable: set `is_active` to `false`
- To re-enable: set `is_active` to `true` and poke the worker: `curl -X POST http://localhost:5070/poke`
- After updating `cron_schedule`, poke the worker so it picks up the new schedule
