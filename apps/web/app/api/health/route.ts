/**
 * Health Check Endpoint
 *
 * Provides comprehensive health status for monitoring and alerting.
 * Checks connectivity to all critical dependencies.
 *
 * GET /api/health - Returns health status of all services
 *
 * Response format:
 * {
 *   status: "healthy" | "degraded" | "unhealthy",
 *   services: { redis: {...}, database: {...} },
 *   system: { uptime: number, memory: {...} },
 *   timestamp: string,
 *   responseTimeMs: number
 * }
 */

import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { createRedisClient } from "@webalive/redis"
import { getRedisUrl } from "@webalive/env/server"
import { getSupabaseCredentials } from "@/lib/env/server"

// Read build info at startup (file is generated at build time)
function getBuildInfo(): { commit: string; branch: string; buildTime: string } {
  // Try multiple paths since location varies between dev and production
  const possiblePaths = [
    join(process.cwd(), "lib/build-info.json"),
    join(process.cwd(), "apps/web/lib/build-info.json"),
    "/root/alive/.builds/staging/current/standalone/apps/web/lib/build-info.json",
    "/root/alive/apps/web/lib/build-info.json",
  ]

  for (const buildInfoPath of possiblePaths) {
    try {
      if (existsSync(buildInfoPath)) {
        const content = readFileSync(buildInfoPath, "utf-8")
        return JSON.parse(content)
      }
    } catch {
      // Continue to next path
    }
  }

  return { commit: "not-found", branch: "unknown", buildTime: "unknown" }
}

const buildInfo = getBuildInfo()

// Types
type ServiceStatus = "connected" | "disconnected" | "error"
type OverallStatus = "healthy" | "degraded" | "unhealthy"

interface ServiceHealth {
  status: ServiceStatus
  responseTimeMs: number
  error?: string
  details?: Record<string, unknown>
}

interface HealthResponse {
  status: OverallStatus
  build: {
    commit: string
    time: string
  }
  services: {
    redis: ServiceHealth
    database: ServiceHealth
  }
  system: {
    uptime: number
    memory: {
      used: number
      total: number
      percentUsed: number
    }
    nodeVersion: string
  }
  timestamp: string
  responseTimeMs: number
}

// Singleton Redis client for health checks (reuse connection)
// In standalone mode, this will be null (Redis not available)
let healthCheckRedis: ReturnType<typeof createRedisClient> | null = null
let healthCheckRedisInitialized = false

function getHealthCheckRedis() {
  if (!healthCheckRedisInitialized) {
    healthCheckRedis = createRedisClient(getRedisUrl())
    healthCheckRedisInitialized = true
  }
  return healthCheckRedis
}

// For testing: reset singleton
export function _resetHealthCheckRedis() {
  healthCheckRedis = null
  healthCheckRedisInitialized = false
}

/**
 * Check Redis connectivity
 * In standalone mode, Redis is not available and returns "skipped" status
 */
async function checkRedis(): Promise<ServiceHealth> {
  const start = performance.now()
  try {
    const redis = getHealthCheckRedis()

    // Standalone mode - Redis not available
    if (!redis) {
      return {
        status: "connected", // Report as "connected" since it's expected in standalone
        responseTimeMs: 0,
        details: {
          mode: "standalone",
          message: "Redis not available in standalone mode",
        },
      }
    }

    const result = await redis.ping()
    const responseTimeMs = Math.round(performance.now() - start)

    if (result === "PONG") {
      return {
        status: "connected",
        responseTimeMs,
        details: {
          state: redis.status,
        },
      }
    }

    return {
      status: "error",
      responseTimeMs,
      error: `Unexpected ping response: ${result}`,
    }
  } catch (error) {
    const responseTimeMs = Math.round(performance.now() - start)
    return {
      status: "disconnected",
      responseTimeMs,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Check Supabase/PostgreSQL connectivity
 * Queries iam.users table to verify database connection.
 * In standalone mode, database is not available and returns "skipped" status.
 */
async function checkDatabase(): Promise<ServiceHealth> {
  // Standalone mode - no database available
  if (process.env.BRIDGE_ENV === "standalone") {
    return {
      status: "connected", // Report as "connected" since it's expected in standalone
      responseTimeMs: 0,
      details: {
        mode: "standalone",
        message: "Database not available in standalone mode",
      },
    }
  }

  const start = performance.now()
  try {
    const { url, key } = getSupabaseCredentials("service")

    // Query iam.users via PostgREST with schema header
    // Supabase requires the schema to be exposed in API settings,
    // or we use the Accept-Profile header for custom schemas
    const response = await fetch(`${url}/rest/v1/users?select=user_id&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Accept-Profile": "iam", // Request from iam schema
      },
    })
    const responseTimeMs = Math.round(performance.now() - start)

    if (response.ok) {
      return {
        status: "connected",
        responseTimeMs,
        details: { schema: "iam", table: "users" },
      }
    }

    // Parse error response
    const errorBody = await response.text()
    let errorMsg = `HTTP ${response.status}`
    try {
      const parsed = JSON.parse(errorBody)
      errorMsg = parsed.message || parsed.error || parsed.hint || errorMsg
    } catch {
      if (errorBody) errorMsg = errorBody.slice(0, 200)
    }

    return {
      status: "error",
      responseTimeMs,
      error: errorMsg,
    }
  } catch (error) {
    const responseTimeMs = Math.round(performance.now() - start)
    return {
      status: "disconnected",
      responseTimeMs,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Get system information
 */
function getSystemInfo() {
  const memUsage = process.memoryUsage()
  const totalMem = memUsage.heapTotal
  const usedMem = memUsage.heapUsed

  return {
    uptime: Math.round(process.uptime()),
    memory: {
      used: Math.round(usedMem / 1024 / 1024), // MB
      total: Math.round(totalMem / 1024 / 1024), // MB
      percentUsed: Math.round((usedMem / totalMem) * 100),
    },
    nodeVersion: process.version,
  }
}

/**
 * Determine overall health status
 */
function determineOverallStatus(redis: ServiceHealth, database: ServiceHealth): OverallStatus {
  const allConnected = redis.status === "connected" && database.status === "connected"
  const anyDisconnected = redis.status === "disconnected" || database.status === "disconnected"

  if (allConnected) return "healthy"
  if (anyDisconnected) return "unhealthy"
  return "degraded"
}

export async function GET() {
  const start = performance.now()

  // Check all services in parallel
  const [redis, database] = await Promise.all([checkRedis(), checkDatabase()])

  const responseTimeMs = Math.round(performance.now() - start)
  const status = determineOverallStatus(redis, database)

  const response: HealthResponse = {
    status,
    build: {
      commit: buildInfo.commit,
      time: buildInfo.buildTime,
    },
    services: {
      redis,
      database,
    },
    system: getSystemInfo(),
    timestamp: new Date().toISOString(),
    responseTimeMs,
  }

  // Return 503 if unhealthy (useful for load balancers)
  const httpStatus = status === "unhealthy" ? 503 : 200

  return Response.json(response, {
    status: httpStatus,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
