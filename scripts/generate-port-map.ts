#!/usr/bin/env bun
/**
 * Generate port-map.json for the preview-proxy Go service.
 *
 * This is the cron fallback (every 5 minutes). The primary trigger is
 * the deploy pipeline, which calls regeneratePortMap() after every deployment.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... bun scripts/generate-port-map.ts
 */

import { regeneratePortMap } from "@webalive/site-controller"

const count = await regeneratePortMap()
console.log(`Wrote ${count} domains to port-map.json`)
