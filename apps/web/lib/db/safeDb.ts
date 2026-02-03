"use client"

/**
 * Safe Database Operations
 *
 * Wraps all Dexie operations to catch quota errors, blocked events, etc.
 * ALWAYS use this instead of calling db methods directly.
 */

export interface DbError {
  type: "quota" | "blocked" | "version" | "unknown"
  message: string
  originalError: unknown
}

/**
 * Execute a database operation safely with error handling.
 * Returns null on failure instead of throwing.
 *
 * @example
 * await safeDb(() => db.messages.add(dbMessage))
 * // Never call db.messages.add/put/delete directly in UI or store code.
 */
export async function safeDb<T>(op: () => Promise<T>): Promise<T | null> {
  try {
    return await op()
  } catch (err) {
    const error = classifyError(err)

    console.error("[dexie] operation failed", {
      errorType: error.type,
      errorMessage: error.message,
      // Include stack for debugging
      stack: err instanceof Error ? err.stack : undefined,
    })

    // TODO: Surface errors in a global toast store
    // For now, just log and return null

    return null
  }
}

/**
 * Execute a database operation with a custom error handler.
 * Use when you need specific handling for different error types.
 */
export async function safeDbWithHandler<T>(op: () => Promise<T>, onError: (error: DbError) => void): Promise<T | null> {
  try {
    return await op()
  } catch (err) {
    const error = classifyError(err)
    onError(error)
    return null
  }
}

/**
 * Classify an error into a known type for structured handling.
 */
function classifyError(err: unknown): DbError {
  if (!(err instanceof Error)) {
    return {
      type: "unknown",
      message: String(err),
      originalError: err,
    }
  }

  // Quota exceeded (IndexedDB storage full)
  if (err.name === "QuotaExceededError" || err.message.includes("quota")) {
    return {
      type: "quota",
      message: "Storage quota exceeded. Try clearing old conversations.",
      originalError: err,
    }
  }

  // Blocked during version upgrade
  if (err.name === "UpgradeError" || err.message.includes("blocked")) {
    return {
      type: "blocked",
      message: "Database upgrade blocked. Please close other tabs and refresh.",
      originalError: err,
    }
  }

  // Version conflict
  if (err.name === "VersionError" || err.message.includes("version")) {
    return {
      type: "version",
      message: "Database version conflict. Please refresh the page.",
      originalError: err,
    }
  }

  return {
    type: "unknown",
    message: err.message,
    originalError: err,
  }
}
