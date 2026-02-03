/**
 * Custom TanStack Query hooks for error handling and debugging
 */

import type { UseQueryResult } from "@tanstack/react-query"
import { useCallback } from "react"
import toast from "react-hot-toast"
import { ApiError } from "./fetcher"

/**
 * Error information from a failed query
 */
export interface QueryError {
  status?: number
  message: string
  isNetworkError: boolean
  isServerError: boolean
  isClientError: boolean
  isAuthError: boolean
}

/**
 * Parse error from query result
 * Handles both ApiError and generic Error types
 */
export function parseQueryError(error: Error | null): QueryError | null {
  if (!error) return null

  // Handle typed ApiError
  if (error instanceof ApiError) {
    return {
      status: error.status,
      message: error.message,
      isNetworkError: false,
      isServerError: error.isServerError,
      isClientError: error.isClientError,
      isAuthError: error.isUnauthorized || error.isForbidden,
    }
  }

  // Handle generic errors by parsing message
  const message = error.message || "Unknown error"
  const isNetworkError = message.includes("fetch") || message.includes("network") || message.includes("Failed to fetch")
  const isServerError = message.includes("500") || message.includes("502") || message.includes("503")
  const isClientError = message.includes("400") || message.includes("404")
  const isAuthError = message.includes("401") || message.includes("403")

  return {
    message,
    isNetworkError,
    isServerError,
    isClientError,
    isAuthError,
  }
}

/**
 * Hook to handle query errors with user feedback
 */
export function useQueryError<T>(query: UseQueryResult<T, Error>) {
  const error = parseQueryError(query.error)

  const showError = useCallback(() => {
    if (!error) return

    if (error.isAuthError) {
      toast.error("Session expired. Please log in again.")
    } else if (error.isNetworkError) {
      toast.error("Network error. Please check your connection.")
    } else if (error.isServerError) {
      toast.error("Server error. Please try again later.")
    } else {
      toast.error(error.message)
    }
  }, [error])

  return {
    error,
    hasError: !!error,
    showError,
  }
}

/**
 * Type-safe wrapper for useQuery with error handling
 */
export function useQueryWithError<T>(query: UseQueryResult<T, Error>) {
  const { error, hasError, showError } = useQueryError(query)

  return {
    ...query,
    error,
    hasError,
    showError,
  }
}
