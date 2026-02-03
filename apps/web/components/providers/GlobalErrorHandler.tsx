/**
 * Global Error Handler Provider
 *
 * Sets up client-side error capture for unhandled rejections and runtime errors.
 * All errors are sent to /api/logs/error for centralized debugging.
 */

"use client"

import { useEffect } from "react"
import { setupGlobalErrorHandler } from "@/lib/client-error-logger"

export function GlobalErrorHandler() {
  useEffect(() => {
    setupGlobalErrorHandler()
  }, [])

  return null
}
