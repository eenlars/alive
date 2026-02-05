/**
 * Hook for loading file contents with caching
 * Extracts async state management from CodeView
 */

import { useCallback, useEffect, useState } from "react"
import { type FileContent, readFile } from "../lib/file-api"

interface UseFileContentResult {
  file: FileContent | null
  loading: boolean
  error: string | null
  reload: () => void
}

// Global cache for file contents - persists across re-renders
// Uses LRU-style eviction with max entries
const MAX_CACHE_ENTRIES = 50
const fileContentCache = new Map<string, { content: FileContent; timestamp: number }>()

function getCacheKey(workspace: string, worktree: string | null | undefined, path: string): string {
  const scope = worktree ? `wt/${worktree}` : "base"
  return `${workspace}::${scope}::${path}`
}

function getFromCache(key: string): FileContent | null {
  const entry = fileContentCache.get(key)
  if (!entry) return null
  // Cache entries are valid for 30 seconds
  if (Date.now() - entry.timestamp > 30000) {
    fileContentCache.delete(key)
    return null
  }
  return entry.content
}

function setInCache(key: string, content: FileContent): void {
  // Evict oldest entries if cache is full
  if (fileContentCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = fileContentCache.keys().next().value
    if (oldestKey) fileContentCache.delete(oldestKey)
  }
  fileContentCache.set(key, { content, timestamp: Date.now() })
}

export function useFileContent(workspace: string, path: string, worktree?: string | null): UseFileContentResult {
  const cacheKey = getCacheKey(workspace, worktree, path)
  const cached = getFromCache(cacheKey)

  const [file, setFile] = useState<FileContent | null>(cached)
  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (skipCache = false) => {
      // Check cache first (unless forced reload)
      if (!skipCache) {
        const cachedContent = getFromCache(cacheKey)
        if (cachedContent) {
          setFile(cachedContent)
          setLoading(false)
          setError(null)
          return
        }
      }

      setLoading(true)
      setError(null)

      const result = await readFile(workspace, path, worktree)

      if (result.ok) {
        setInCache(cacheKey, result.data)
        setFile(result.data)
      } else {
        setError(result.error)
      }

      setLoading(false)
    },
    [workspace, path, worktree, cacheKey],
  )

  useEffect(() => {
    load()
  }, [load])

  // Force reload bypasses cache
  const reload = useCallback(() => load(true), [load])

  return { file, loading, error, reload }
}

// Export cache invalidation for manual refresh (e.g., after file edit)
export function invalidateFileContentCache(workspace?: string, worktree?: string | null, path?: string): void {
  if (workspace && path) {
    fileContentCache.delete(getCacheKey(workspace, worktree, path))
    return
  }
  if (workspace) {
    const scope = worktree ? `wt/${worktree}` : "base"
    for (const key of fileContentCache.keys()) {
      if (key.startsWith(`${workspace}::${scope}::`)) {
        fileContentCache.delete(key)
      }
    }
    return
  }
  fileContentCache.clear()
}
