"use client"

import { useCallback, useEffect, useRef, useState } from "react"

interface UseFetchOptions<T> {
  url: string | null
  validator?: (data: unknown) => data is T
  onSuccess?: (data: T) => void
  dependencies?: unknown[]
}

interface UseFetchResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  retry: () => void
}

/**
 * Reusable fetch hook with automatic retry, race condition protection, and cleanup
 *
 * @example
 * const { data, loading, error, retry } = useFetch({
 *   url: `/api/workspaces?org_id=${orgId}`,
 *   validator: (data): data is WorkspaceResponse => data.ok === true,
 *   onSuccess: (data) => setWorkspaces(data.workspaces),
 *   dependencies: [orgId]
 * })
 */
export function useFetch<T>({ url, validator, onSuccess, dependencies = [] }: UseFetchOptions<T>): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(async () => {
    if (!url) {
      setData(null)
      setLoading(false)
      setError(null)
      return
    }

    // Abort previous request if still in flight
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(url, {
        credentials: "include",
        signal: controller.signal,
      })

      // Check if this request was aborted
      if (controller.signal.aborted) return

      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`)
      }

      const json = await response.json()

      if (controller.signal.aborted) return

      if (validator && !validator(json)) {
        throw new Error(json.error || "Invalid response format")
      }

      setData(json as T)
      setError(null)
      onSuccess?.(json as T)
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return

      const errorMessage = err instanceof Error ? err.message : "Network error - check your connection"
      console.error("Fetch error:", err)
      setError(errorMessage)
      setData(null)
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }, [url, validator, onSuccess])

  // Auto-fetch when dependencies change
  useEffect(() => {
    fetchData()

    // Cleanup: abort on unmount or dependency change
    return () => {
      abortControllerRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, retryCount, ...dependencies])

  const retry = useCallback(() => {
    setRetryCount(prev => prev + 1)
  }, [])

  return { data, loading, error, retry }
}
