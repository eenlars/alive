import type { RequestLogger } from "@/lib/request-logger"

export interface RetryObservability {
  retry_attempted: boolean
  retry_reason: "stale_session" | "stale_message" | "not_applicable"
  retry_outcome: "success" | "failed" | "not_attempted"
}

export function logRetryContract(logger: RequestLogger, fields: RetryObservability): void {
  logger.log(
    `[SESSION RETRY] retry_attempted=${fields.retry_attempted} retry_reason=${fields.retry_reason} retry_outcome=${fields.retry_outcome}`,
  )
}
