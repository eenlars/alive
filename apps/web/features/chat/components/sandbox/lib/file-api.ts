/**
 * File API client for sandbox views
 * Extracted to eliminate duplication between FilesView and CodeView
 */

export interface FileInfo {
  name: string
  type: "file" | "directory"
  size: number
  modified: string
  path: string
}

export interface FileContent {
  content: string
  filename: string
  language: string
  size: number
}

interface ApiResult<T> {
  ok: true
  data: T
}

interface ApiError {
  ok: false
  error: string
}

type ApiResponse<T> = ApiResult<T> | ApiError

export async function listFiles(workspace: string, path: string): Promise<ApiResponse<FileInfo[]>> {
  try {
    const response = await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace, path }),
    })

    const data = await response.json()

    if (!response.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to load files" }
    }

    return { ok: true, data: data.files || [] }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to load files" }
  }
}

export async function readFile(workspace: string, path: string): Promise<ApiResponse<FileContent>> {
  try {
    const response = await fetch("/api/files/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace, path }),
    })

    const data = await response.json()

    if (!response.ok || !data.ok) {
      return { ok: false, error: data.error || "Failed to load file" }
    }

    return {
      ok: true,
      data: {
        content: data.content,
        filename: data.filename,
        language: data.language,
        size: data.size,
      },
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to load file" }
  }
}
