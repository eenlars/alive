export type ErrorLogLevel = "debug" | "info" | "warn" | "error" | "fatal"

export interface ErrorLogContext {
  component?: string
  operation?: string
  requestId?: string
  userId?: string
  workspace?: string
  [key: string]: unknown
}

export interface ErrorLogEntry {
  level: ErrorLogLevel
  message: string
  error?: unknown
  context?: ErrorLogContext
  timestamp: string
}

export type ErrorLogSink = (entry: ErrorLogEntry) => void | Promise<void>

function defaultSink(entry: ErrorLogEntry): void {
  const payload = {
    level: entry.level,
    message: entry.message,
    error: entry.error,
    context: entry.context,
    timestamp: entry.timestamp,
  }
  console.error("[error-logger]", JSON.stringify(payload))
}

export function createErrorLogger(sink: ErrorLogSink = defaultSink) {
  const log = async (
    level: ErrorLogLevel,
    message: string,
    error?: unknown,
    context?: ErrorLogContext,
  ): Promise<void> => {
    await sink({
      level,
      message,
      error,
      context,
      timestamp: new Date().toISOString(),
    })
  }

  return {
    debug: (message: string, context?: ErrorLogContext) => log("debug", message, undefined, context),
    info: (message: string, context?: ErrorLogContext) => log("info", message, undefined, context),
    warn: (message: string, error?: unknown, context?: ErrorLogContext) => log("warn", message, error, context),
    error: (message: string, error?: unknown, context?: ErrorLogContext) => log("error", message, error, context),
    fatal: (message: string, error?: unknown, context?: ErrorLogContext) => log("fatal", message, error, context),
  }
}

export const errorLogger = createErrorLogger()
