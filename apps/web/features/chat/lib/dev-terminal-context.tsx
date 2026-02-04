"use client"
import { createContext, type ReactNode, useContext, useState } from "react"
import type { BridgeStreamType } from "./streaming/ndjson"

/**
 * Client Request Types
 * Events sent from client to server
 */
export const ClientRequest = {
  MESSAGE: "client_request_message",
  INTERRUPT: "client_request_interrupt",
} as const

export type ClientRequestType = (typeof ClientRequest)[keyof typeof ClientRequest]

/**
 * Client Error Types
 * Errors that occur on the client side
 */
export const ClientError = {
  TIMEOUT_ERROR: "client_error_timeout",
  PARSE_ERROR: "client_error_parse",
  INVALID_EVENT_STRUCTURE: "client_error_invalid_structure",
  CRITICAL_PARSE_ERROR: "client_error_critical_parse",
  READER_ERROR: "client_error_reader",
  HTTP_ERROR: "client_error_http",
  GENERAL_ERROR: "client_error_general",
} as const

export type ClientErrorType = (typeof ClientError)[keyof typeof ClientError]

/**
 * Dev Event Names - All possible event names in dev terminal
 * Combines client requests, client errors, and server responses
 */
export type DevEventName =
  | ClientRequestType
  | ClientErrorType
  | (typeof BridgeStreamType)[keyof typeof BridgeStreamType]

export interface ClientStreamEvent {
  type: ClientRequestType | ClientErrorType | BridgeStreamType
  requestId: string
  timestamp: string
  data: unknown
}

export interface DevSSEEvent {
  event: ClientStreamEvent
  eventName: DevEventName
  rawSSE: string
}

interface DevTerminalContextType {
  events: DevSSEEvent[]
  addEvent: (event: DevSSEEvent) => void
  clearEvents: () => void
}

const DevTerminalContext = createContext<DevTerminalContextType | undefined>(undefined)

export function DevTerminalProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<DevSSEEvent[]>([])

  const addEvent = (event: DevSSEEvent) => {
    setEvents(prev => [...prev, event])
  }

  const clearEvents = () => {
    setEvents([])
  }

  return <DevTerminalContext.Provider value={{ events, addEvent, clearEvents }}>{children}</DevTerminalContext.Provider>
}

export function useDevTerminal() {
  const context = useContext(DevTerminalContext)
  if (!context) {
    throw new Error("useDevTerminal must be used within DevTerminalProvider")
  }
  return context
}
