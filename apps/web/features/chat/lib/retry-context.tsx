"use client"

import { createContext, type ReactNode, useCallback, useContext, useRef } from "react"

interface RetryContextValue {
  /** Retry the last message that was sent */
  retryLastMessage: () => void
  /** Register the retry handler (called by the chat page) */
  registerRetryHandler: (handler: () => void) => void
}

const RetryContext = createContext<RetryContextValue | null>(null)

export function RetryProvider({ children }: { children: ReactNode }) {
  const retryHandlerRef = useRef<(() => void) | null>(null)

  const registerRetryHandler = useCallback((handler: () => void) => {
    retryHandlerRef.current = handler
  }, [])

  const retryLastMessage = useCallback(() => {
    if (retryHandlerRef.current) {
      retryHandlerRef.current()
    }
  }, [])

  return <RetryContext.Provider value={{ retryLastMessage, registerRetryHandler }}>{children}</RetryContext.Provider>
}

export function useRetry() {
  const context = useContext(RetryContext)
  if (!context) {
    // Return a no-op if context is not available (for tests, etc.)
    return {
      retryLastMessage: () => {},
      registerRetryHandler: () => {},
    }
  }
  return context
}
