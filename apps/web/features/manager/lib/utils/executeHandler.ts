/**
 * Utility for executing async handlers with consistent error handling,
 * loading states, and toast notifications
 */

"use client"

import toast from "react-hot-toast"

export interface ExecuteHandlerOptions {
  fn: () => Promise<any>
  onLoading: (loading: boolean) => void
  successMessage: string
  errorMessage?: string
  onSuccess?: (result?: any) => void
  logError?: boolean
}

export async function executeHandler({
  fn,
  onLoading,
  successMessage,
  errorMessage = "Operation failed",
  onSuccess,
  logError = true,
}: ExecuteHandlerOptions): Promise<any> {
  onLoading(true)
  try {
    const result = await fn()
    toast.success(successMessage)
    onSuccess?.()
    return result
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    if (logError) {
      console.error(errorMessage, error)
    }
    toast.error(err.message || errorMessage)
    return null
  } finally {
    onLoading(false)
  }
}
