"use client"

import posthog from "posthog-js"
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react"
import { useEffect, type ReactNode } from "react"

/**
 * PostHog Analytics & Error Tracking Provider
 *
 * Initializes PostHog with:
 * - Exception autocapture for automatic error tracking
 * - Session recording for debugging
 * - Feature flags support
 *
 * Requires NEXT_PUBLIC_POSTHOG_KEY and NEXT_PUBLIC_POSTHOG_HOST env vars.
 * If not configured, renders children without PostHog integration.
 */

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com"

// Track initialization state
let isInitialized = false

function initPostHog() {
  if (isInitialized || typeof window === "undefined" || !POSTHOG_KEY) {
    return
  }

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // Enable exception autocapture for error tracking
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    // Exception capture - the main error tracking feature
    capture_exceptions: true,
    // Session recording for debugging
    session_recording: {
      // Mask all text inputs for privacy
      maskTextSelector: "*",
    },
    // Disable in development
    loaded: _ph => {
      if (process.env.NODE_ENV === "development") {
        // Optional: disable in dev to reduce noise
        // _ph.opt_out_capturing()
      }
    },
    // Respect Do Not Track
    respect_dnt: true,
    // Persistence
    persistence: "localStorage+cookie",
  })

  isInitialized = true
}

/**
 * Hook to manually capture exceptions with PostHog
 *
 * @example
 * ```tsx
 * const { captureException } = usePostHogErrorCapture()
 *
 * try {
 *   await riskyOperation()
 * } catch (error) {
 *   captureException(error, { context: 'chat', action: 'send_message' })
 * }
 * ```
 */
export function usePostHogErrorCapture() {
  const ph = usePostHog()

  return {
    captureException: (error: Error | unknown, properties?: Record<string, unknown>) => {
      if (!POSTHOG_KEY) {
        console.error("[PostHog] Error capture disabled - no API key:", error)
        return
      }

      const errorObj = error instanceof Error ? error : new Error(String(error))

      ph.captureException(errorObj, {
        ...properties,
        $exception_message: errorObj.message,
        $exception_stack_trace_raw: errorObj.stack,
      })
    },
  }
}

/**
 * Standalone function to capture exceptions without hook context
 * Use this in error boundaries or non-React code
 */
export function captureException(error: Error | unknown, properties?: Record<string, unknown>) {
  if (!POSTHOG_KEY || typeof window === "undefined") {
    console.error("[PostHog] Error capture disabled:", error)
    return
  }

  const errorObj = error instanceof Error ? error : new Error(String(error))

  posthog.captureException(errorObj, {
    ...properties,
    $exception_message: errorObj.message,
    $exception_stack_trace_raw: errorObj.stack,
  })
}

/**
 * Internal component to setup global error handlers
 */
function PostHogErrorHandler() {
  useEffect(() => {
    if (!POSTHOG_KEY) return

    // Capture unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      captureException(event.reason, {
        $exception_type: "unhandled_rejection",
        $exception_source: "window",
      })
    }

    // Capture runtime errors
    const handleError = (event: ErrorEvent) => {
      captureException(event.error ?? new Error(event.message), {
        $exception_type: "runtime_error",
        $exception_source: "window",
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      })
    }

    window.addEventListener("unhandledrejection", handleUnhandledRejection)
    window.addEventListener("error", handleError)

    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection)
      window.removeEventListener("error", handleError)
    }
  }, [])

  return null
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  // Initialize PostHog on first render
  useEffect(() => {
    initPostHog()
  }, [])

  // If no PostHog key, just render children without the provider
  if (!POSTHOG_KEY) {
    return <>{children}</>
  }

  return (
    <PHProvider client={posthog}>
      <PostHogErrorHandler />
      {children}
    </PHProvider>
  )
}
