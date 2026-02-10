/**
 * Port Map Generator
 *
 * Regenerates /var/lib/alive/generated/port-map.json from Supabase app.domains.
 * Called after every deployment. Verifies the target domain is present, then
 * sends SIGHUP to preview-proxy for instant reload.
 *
 * Strict: throws on any failure. A deployment without a working preview is not a deployment.
 */

import { execSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { createClient } from "@supabase/supabase-js"
import type { AppDatabase } from "@webalive/database"
import { PATHS } from "../constants.js"

const PORT_MAP_FILENAME = "port-map.json"
const PREVIEW_PROXY_SERVICE = "preview-proxy.service"

function getOutputPath(): string {
  const generatedDir = PATHS.GENERATED_DIR
  if (generatedDir) {
    return join(generatedDir, PORT_MAP_FILENAME)
  }
  return `/var/lib/alive/generated/${PORT_MAP_FILENAME}`
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error("[port-map] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
  }
  return createClient<AppDatabase>(url, key, { db: { schema: "app" } })
}

/**
 * Send SIGHUP to the preview-proxy so it reloads the port-map immediately.
 * Throws if the signal fails — a stale proxy is a broken preview.
 */
function signalPreviewProxy(): void {
  try {
    execSync(`systemctl kill --signal=SIGHUP ${PREVIEW_PROXY_SERVICE}`, {
      timeout: 5_000,
      stdio: "pipe",
    })
  } catch (err) {
    // Check if service simply doesn't exist (dev/CI) — that's the only acceptable failure
    try {
      const status = execSync(`systemctl is-enabled ${PREVIEW_PROXY_SERVICE} 2>&1`, {
        timeout: 5_000,
        encoding: "utf-8",
      }).trim()
      // If the service is enabled but SIGHUP failed, that's a real error
      if (status === "enabled") {
        throw new Error(
          `[port-map] Failed to signal ${PREVIEW_PROXY_SERVICE}: ${err instanceof Error ? err.message : err}`,
        )
      }
    } catch (checkErr) {
      // is-enabled failed = service doesn't exist = dev environment, fine
      if (checkErr instanceof Error && checkErr.message.includes("Failed to signal")) {
        throw checkErr
      }
    }
  }
}

/**
 * Regenerate port-map.json from Supabase, verify it, and signal the Go preview-proxy.
 *
 * @param requiredHostname - If set, throws if this hostname is missing from the result.
 *                           Used by deploy pipeline to guarantee the new site is routable.
 * @returns number of domains written
 * @throws Error if Supabase query fails, required hostname missing, or signal fails
 */
export async function regeneratePortMap(requiredHostname?: string): Promise<number> {
  const app = getSupabaseClient()
  const { data, error } = await app.from("domains").select("hostname, port")

  if (error) {
    throw new Error(`[port-map] Failed to fetch domains: ${error.message}`)
  }

  const portMap: Record<string, number> = {}
  for (const row of data || []) {
    if (row.hostname && row.port) {
      portMap[row.hostname] = row.port
    }
  }

  // Strict: if a hostname was just deployed, it MUST be in the DB result
  if (requiredHostname && !(requiredHostname in portMap)) {
    throw new Error(
      `[port-map] Required hostname "${requiredHostname}" not found in domains table. ` +
        `registerDomain() may have failed silently. Got ${Object.keys(portMap).length} domains.`,
    )
  }

  const outputPath = getOutputPath()
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, JSON.stringify(portMap, null, 2), "utf-8")

  // Read back and verify the file was written correctly
  const written = JSON.parse(readFileSync(outputPath, "utf-8")) as Record<string, number>
  if (requiredHostname && !(requiredHostname in written)) {
    throw new Error(`[port-map] Write verification failed: "${requiredHostname}" not in ${outputPath}`)
  }

  // Signal preview-proxy to reload immediately
  signalPreviewProxy()

  return Object.keys(portMap).length
}
