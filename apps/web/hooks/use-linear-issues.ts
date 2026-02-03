/**
 * React hook for fetching Linear issues assigned to the current user
 */

import { useCallback, useEffect, useState } from "react"

export interface LinearIssue {
  id: string
  identifier: string
  title: string
  description?: string
  priority: number
  priorityLabel: string
  state: {
    id: string
    name: string
    color: string
    type: string
  }
  url: string
  createdAt: string
  updatedAt: string
}

interface UseLinearIssuesOptions {
  limit?: number
  includeCompleted?: boolean
  enabled?: boolean
}

interface UseLinearIssuesResult {
  issues: LinearIssue[]
  loading: boolean
  error: string | null
  isConnected: boolean
  refetch: () => Promise<void>
}

/**
 * Hook to fetch Linear issues assigned to the current user
 *
 * @param options.limit - Max number of issues to fetch (default 25, max 50)
 * @param options.includeCompleted - Include completed/canceled issues (default false)
 * @param options.enabled - Whether to fetch issues (default true)
 */
export function useLinearIssues(options: UseLinearIssuesOptions = {}): UseLinearIssuesResult {
  const { limit = 25, includeCompleted = false, enabled = true } = options

  const [issues, setIssues] = useState<LinearIssue[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(true)

  const fetchIssues = useCallback(async () => {
    if (!enabled) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: String(limit),
        includeCompleted: String(includeCompleted),
      })

      const response = await fetch(`/api/linear/issues?${params}`, {
        method: "GET",
        credentials: "include",
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))

        // Check if it's a "not connected" error
        if (response.status === 400 && errorData.error === "integration_not_connected") {
          setIsConnected(false)
          setIssues([])
          return
        }

        throw new Error(errorData.message || `Failed to fetch issues: ${response.statusText}`)
      }

      const data = await response.json()
      setIssues(data.issues || [])
      setIsConnected(true)
    } catch (err) {
      console.error("[useLinearIssues] Error:", err)
      setError(err instanceof Error ? err.message : "Failed to load issues")
      setIssues([])
    } finally {
      setLoading(false)
    }
  }, [enabled, limit, includeCompleted])

  useEffect(() => {
    fetchIssues()
  }, [fetchIssues])

  return {
    issues,
    loading,
    error,
    isConnected,
    refetch: fetchIssues,
  }
}
