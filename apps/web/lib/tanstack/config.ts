/**
 * Production-grade TanStack Query configuration
 * Handles error logging, retries, cache management, and DevTools
 */

import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query"
import { authStore } from "@/lib/stores/authStore"

/**
 * Custom error handler for queries
 * Logs errors, handles 401s, and manages error states
 */
function handleQueryError(error: Error, query: any) {
  const message = error instanceof Error ? error.message : "Unknown error"

  // Log error with query context
  console.error("[TanStack] Query Error", {
    queryKey: query.queryKey,
    message,
    timestamp: new Date().toISOString(),
  })

  // Handle 401 - session expired
  if (error.message?.includes("401")) {
    authStore.handleSessionExpired("Session expired - please log in again")
  }
}

/**
 * Custom error handler for mutations
 */
function handleMutationError(error: Error, mutation: any) {
  const message = error instanceof Error ? error.message : "Unknown error"

  console.error("[TanStack] Mutation Error", {
    mutationKey: mutation.mutationKey,
    message,
    timestamp: new Date().toISOString(),
  })

  // Handle 401
  if (error.message?.includes("401")) {
    authStore.handleSessionExpired("Session expired - please log in again")
  }
}

/**
 * Exponential backoff retry delay
 * Prevents hammering server on failures
 */
export function getRetryDelay(attemptIndex: number): number {
  // 500ms, 1s, 2s, 4s, 8s, 16s (capped)
  const delay = Math.min(1000 * 2 ** attemptIndex, 16000)
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 100
  return delay + jitter
}

/**
 * Determine if error is retryable
 */
function shouldRetry(failureCount: number, error: Error): boolean {
  // Don't retry on 401, 403, 404
  if (error.message?.includes("401") || error.message?.includes("403") || error.message?.includes("404")) {
    return false
  }
  // Retry max 3 times
  return failureCount < 3
}

/**
 * Create production QueryClient
 */
export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: handleQueryError,
    }),
    mutationCache: new MutationCache({
      onError: handleMutationError,
    }),
    defaultOptions: {
      queries: {
        // Data is fresh for 5 minutes
        staleTime: 5 * 60 * 1000,
        // Keep in memory for 30 minutes
        gcTime: 30 * 60 * 1000,
        // Smart retry with exponential backoff
        retry: shouldRetry,
        retryDelay: getRetryDelay,
        // Don't refetch on window focus (annoying for users)
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 1,
        retryDelay: getRetryDelay,
      },
    },
  })
}
