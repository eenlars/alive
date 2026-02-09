#!/usr/bin/env bun
/**
 * Generate port-map.json for the preview-proxy Go service.
 * Reads hostname→port mappings from Supabase app.domains and writes a JSON file.
 *
 * Usage:
 *   bun scripts/generate-port-map.ts
 *
 * Output: /var/lib/alive/generated/port-map.json
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { createAppClient } from "../apps/web/lib/supabase/app"

const OUTPUT_PATH = "/var/lib/alive/generated/port-map.json"

async function main() {
	const app = await createAppClient("service")
	const { data, error } = await app.from("domains").select("hostname, port")

	if (error) {
		console.error("Failed to fetch domains:", error)
		process.exit(1)
	}

	const portMap: Record<string, number> = {}
	for (const row of data || []) {
		if (row.hostname && row.port) {
			portMap[row.hostname] = row.port
		}
	}

	mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
	writeFileSync(OUTPUT_PATH, JSON.stringify(portMap, null, 2), "utf-8")

	console.log(`Wrote ${Object.keys(portMap).length} domains to ${OUTPUT_PATH}`)
}

main()
