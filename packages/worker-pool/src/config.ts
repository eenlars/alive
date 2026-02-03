/**
 * Worker Pool Configuration
 *
 * Uses constants from @webalive/shared as single source of truth.
 */

import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { WORKER_POOL } from "@webalive/shared"
import type { WorkerPoolConfig } from "./types.js"

/**
 * Resolve the worker entry path from this module's location.
 * Works in both development (src/) and production (dist/).
 */
function resolveWorkerEntryPath(): string {
  // In ESM, use import.meta.url to get current file location
  // This works whether we're in src/ or dist/
  const currentDir = dirname(fileURLToPath(import.meta.url))
  const packageRoot = join(currentDir, "..")

  // worker-entry.mjs is always in src/ (not compiled)
  return join(packageRoot, "src", "worker-entry.mjs")
}

/** Default configuration values from shared constants */
export const DEFAULT_CONFIG: WorkerPoolConfig = {
  maxWorkers: WORKER_POOL.MAX_WORKERS,
  inactivityTimeoutMs: WORKER_POOL.INACTIVITY_TIMEOUT_MS,
  maxAgeMs: WORKER_POOL.MAX_AGE_MS,
  evictionStrategy: WORKER_POOL.EVICTION_STRATEGY,
  workerEntryPath: resolveWorkerEntryPath(),
  socketDir: WORKER_POOL.SOCKET_DIR,
  readyTimeoutMs: WORKER_POOL.READY_TIMEOUT_MS,
  shutdownTimeoutMs: WORKER_POOL.SHUTDOWN_TIMEOUT_MS,
  cancelTimeoutMs: WORKER_POOL.CANCEL_TIMEOUT_MS,
}

/**
 * Create configuration with optional overrides.
 * Validates all config values and throws on invalid input.
 */
export function createConfig(overrides?: Partial<WorkerPoolConfig>): WorkerPoolConfig {
  const config = {
    ...DEFAULT_CONFIG,
    ...overrides,
  }

  // Validate numeric bounds
  if (!Number.isInteger(config.maxWorkers) || config.maxWorkers < 1) {
    throw new Error(`Invalid maxWorkers: ${config.maxWorkers} (must be positive integer)`)
  }
  if (!Number.isInteger(config.inactivityTimeoutMs) || config.inactivityTimeoutMs < 0) {
    throw new Error(`Invalid inactivityTimeoutMs: ${config.inactivityTimeoutMs} (must be non-negative integer)`)
  }
  if (!Number.isInteger(config.maxAgeMs) || config.maxAgeMs < 0) {
    throw new Error(`Invalid maxAgeMs: ${config.maxAgeMs} (must be non-negative integer)`)
  }
  if (!Number.isInteger(config.readyTimeoutMs) || config.readyTimeoutMs < 1) {
    throw new Error(`Invalid readyTimeoutMs: ${config.readyTimeoutMs} (must be positive integer)`)
  }
  if (!Number.isInteger(config.shutdownTimeoutMs) || config.shutdownTimeoutMs < 1) {
    throw new Error(`Invalid shutdownTimeoutMs: ${config.shutdownTimeoutMs} (must be positive integer)`)
  }
  if (!Number.isInteger(config.cancelTimeoutMs) || config.cancelTimeoutMs < 1) {
    throw new Error(`Invalid cancelTimeoutMs: ${config.cancelTimeoutMs} (must be positive integer)`)
  }

  // Validate eviction strategy
  const validStrategies = ["lru", "oldest", "least_used"] as const
  if (!validStrategies.includes(config.evictionStrategy as (typeof validStrategies)[number])) {
    throw new Error(
      `Invalid evictionStrategy: ${config.evictionStrategy} (must be one of: ${validStrategies.join(", ")})`,
    )
  }

  // Validate paths are non-empty
  if (typeof config.workerEntryPath !== "string" || config.workerEntryPath.length === 0) {
    throw new Error("workerEntryPath must be a non-empty string")
  }
  if (typeof config.socketDir !== "string" || config.socketDir.length === 0) {
    throw new Error("socketDir must be a non-empty string")
  }

  return config
}

/** Generate socket path for a workspace */
export function getSocketPath(socketDir: string, workspaceKey: string): string {
  // Sanitize workspace key for filesystem
  const safeKey = workspaceKey.replace(/[^a-zA-Z0-9_-]/g, "_")
  return join(socketDir, `worker-${safeKey}.sock`)
}
