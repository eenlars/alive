#!/usr/bin/env bun
/**
 * Generate port-map.json for the preview-proxy Go service.
 * Reads hostname→port mappings from Supabase app.domains and writes a JSON file.
 *
 * Output path is read from server-config.json (generated.dir + /port-map.json).
 *
 * Usage:
 *   bun scripts/generate-port-map.ts
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { createAppClient } from "../apps/web/lib/supabase/app"

const CONFIG_PATH = process.env.SERVER_CONFIG_PATH || "/var/lib/alive/server-config.json"

function getOutputPath(): string {
	try {
		const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"))
		const generatedDir = config.generated?.dir
		if (generatedDir) {
			return join(generatedDir, "port-map.json")
		}
	} catch {
		// Fall through to default
	}
	return "/var/lib/alive/generated/port-map.json"
}

const OUTPUT_PATH = getOutputPath()

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

main().catch(err => {
	console.error("Fatal:", err)
	process.exit(1)
})
