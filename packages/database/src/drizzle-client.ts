/**
 * Drizzle Database Client
 *
 * Provides type-safe database access using Drizzle ORM.
 * Works with any PostgreSQL database (Supabase, self-hosted, etc.)
 *
 * Usage:
 * ```typescript
 * import { createDrizzleClient, db } from '@webalive/database/drizzle'
 *
 * // Use the pre-configured client
 * const users = await db.select().from(schema.users)
 *
 * // Or create a custom client
 * const customDb = createDrizzleClient({ connectionString: '...' })
 * ```
 */

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import { Pool, type PoolConfig } from "pg"
import * as schema from "./schema"

// ============================================================================
// Types
// ============================================================================

export type DrizzleClient = NodePgDatabase<typeof schema>

export interface DrizzleClientConfig {
  /** PostgreSQL connection string */
  connectionString?: string
  /** Pool configuration options */
  poolConfig?: PoolConfig
  /** Enable logging */
  logging?: boolean
}

// ============================================================================
// Client Factory
// ============================================================================

/**
 * Create a Drizzle database client
 */
export function createDrizzleClient(config: DrizzleClientConfig = {}): DrizzleClient {
  const {
    connectionString = process.env.DATABASE_URL,
    poolConfig = {},
    logging = process.env.NODE_ENV === "development",
  } = config

  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required. " + "Set it to your PostgreSQL connection string.")
  }

  // Default pool configuration for production
  const defaultPoolConfig: PoolConfig = {
    connectionString,
    max: process.env.NODE_ENV === "development" ? 8 : 20,
    idleTimeoutMillis: process.env.NODE_ENV === "development" ? 5000 : 30000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
    ...poolConfig,
  }

  const pool = new Pool(defaultPoolConfig)

  // Handle pool errors
  pool.on("error", (err: Error) => {
    console.error("[Database] Unexpected pool error:", err)
  })

  return drizzle(pool, {
    schema,
    logger: logging,
  })
}

// ============================================================================
// Singleton Client
// ============================================================================

let _db: DrizzleClient | null = null

/**
 * Get the singleton database client
 * Creates one if it doesn't exist
 */
export function getDb(): DrizzleClient {
  if (!_db) {
    _db = createDrizzleClient()
  }
  return _db
}

/**
 * Pre-configured singleton database client
 * Use this for most database operations
 */
export const db = new Proxy({} as DrizzleClient, {
  get(_, prop) {
    return (getDb() as any)[prop]
  },
})

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if database connection is working
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const client = getDb()
    await client.execute("SELECT 1")
    return true
  } catch (error) {
    console.error("[Database] Connection check failed:", error)
    return false
  }
}

/**
 * Close the database connection pool
 * Call this during graceful shutdown
 */
export async function closeConnection(): Promise<void> {
  if (_db) {
    // Note: Drizzle doesn't expose pool.end() directly
    // The pool will be garbage collected when the client is no longer referenced
    _db = null
  }
}

// ============================================================================
// Re-exports
// ============================================================================

// Re-export Drizzle operators for queries
export {
  and,
  asc,
  avg,
  between,
  count,
  desc,
  eq,
  exists,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  max,
  min,
  ne,
  not,
  notBetween,
  notExists,
  notIlike,
  notInArray,
  notLike,
  or,
  sql,
  sum,
} from "drizzle-orm"
// Re-export schema for convenience
export * as schema from "./schema"
