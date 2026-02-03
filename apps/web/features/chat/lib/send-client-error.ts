import { isDevelopment } from "@/lib/stores/debug-store"
import type { ClientErrorType, DevSSEEvent } from "./dev-terminal-context"

export interface ClientErrorData {
  errorType: ClientErrorType
  [key: string]: unknown
}

export function sendClientError(params: {
  tabId: string
  errorType: ClientErrorType
  data: Record<string, unknown>
  addDevEvent: (event: DevSSEEvent) => void
}): void {
  if (!isDevelopment()) return

  const { tabId, errorType, data, addDevEvent } = params

  const errorData: ClientErrorData = {
    errorType,
    ...data,
  }

  const eventData = {
    type: errorType,
    requestId: tabId,
    timestamp: new Date().toISOString(),
    data: errorData,
  }

  const devEvent: DevSSEEvent = {
    eventName: errorType,
    event: eventData,
    rawSSE: `${JSON.stringify(eventData)}\n`,
  }

  addDevEvent(devEvent)
}
