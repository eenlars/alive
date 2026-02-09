"use client"

import { postty } from "@/lib/api/api-client"
import { validateRequest } from "@/lib/api/schemas"

export type { Res } from "@/lib/api/schemas"

export interface FilespaceFile {
  name: string
  type: "file" | "directory"
  size: number
  modified: string
  path: string
}

export async function listFilespace(workspace: string, dirPath: string, worktree?: string | null) {
  const body = validateRequest("filespace/list", {
    workspace,
    path: dirPath,
    worktree: worktree || undefined,
  })
  return postty("filespace/list", body)
}

export async function deleteFilespaceItem(
  workspace: string,
  filePath: string,
  options?: { worktree?: string | null; recursive?: boolean },
) {
  const body = validateRequest("filespace/delete", {
    workspace,
    path: filePath,
    worktree: options?.worktree || undefined,
    recursive: options?.recursive,
  })
  return postty("filespace/delete", body)
}

export async function uploadFilespaceItem(workspace: string, file: File, worktree?: string | null) {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("workspace", workspace)
  if (worktree) formData.append("worktree", worktree)

  const res = await fetch("/api/files/upload", {
    method: "POST",
    credentials: "include",
    body: formData,
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error?.message || data.message || `Upload failed (${res.status})`)
  }

  return res.json() as Promise<{ ok: true; path: string; originalName: string; size: number; mimeType: string }>
}
