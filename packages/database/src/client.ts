/**
 * Database Client Factory
 *
 * Centralized database client creation for all schemas
 * Handles both server (with cookies) and test environments properly
 */

import { createClient } from "@supabase/supabase-js"
import type { IamDatabase, AppDatabase, IntegrationsDatabase, LockboxDatabase, PublicDatabase } from "./index"

interface ClientConfig {
  url: string
  key: string
  schema?: "public" | "iam" | "app" | "integrations" | "lockbox"
}

/**
 * Create a database client for a specific schema
 * Works in all environments including tests
 */
export function createDatabaseClient<T = PublicDatabase>(config: ClientConfig) {
  const { url, key, schema = "public" } = config

  // Cast to any to avoid complex generic type issues with Supabase client
  return createClient<T>(url, key, {
    db: {
      schema: schema as any,
    },
  })
}

/**
 * Type-safe schema-specific client creators
 */
export function createPublicClient(url: string, key: string) {
  return createDatabaseClient<PublicDatabase>({ url, key, schema: "public" })
}

export function createIamClient(url: string, key: string) {
  return createDatabaseClient<IamDatabase>({ url, key, schema: "iam" })
}

export function createAppClient(url: string, key: string) {
  return createDatabaseClient<AppDatabase>({ url, key, schema: "app" })
}

export function createIntegrationsClient(url: string, key: string) {
  return createDatabaseClient<IntegrationsDatabase>({ url, key, schema: "integrations" })
}

export function createLockboxClient(url: string, key: string) {
  return createDatabaseClient<LockboxDatabase>({ url, key, schema: "lockbox" })
}
