import { runScript } from "./common.js"
import type { PortAssignment } from "../types.js"

export interface AssignPortParams {
  domain: string
  registryPath: string
}

/**
 * Assign a port to a domain
 *
 * @param params - Port assignment parameters
 * @returns Port assignment result
 */
export async function assignPort(params: AssignPortParams): Promise<PortAssignment> {
  // Validate required database credentials
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required for port assignment")
  }
  if (!process.env.DATABASE_PASSWORD) {
    throw new Error("DATABASE_PASSWORD environment variable is required for port assignment")
  }

  const stdout = await runScript("00-assign-port.sh", {
    SITE_DOMAIN: params.domain,
    REGISTRY_PATH: params.registryPath,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_PASSWORD: process.env.DATABASE_PASSWORD,
  })

  const port = parseInt(stdout.trim(), 10)

  if (Number.isNaN(port)) {
    throw new Error(`Invalid port returned from script: ${stdout}`)
  }

  // Determine if this was a new assignment by checking stdout for "already has"
  const isNew = !stdout.includes("already has assigned port")

  return { port, isNew }
}
