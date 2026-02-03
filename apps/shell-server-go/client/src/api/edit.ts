// Editor API functions for the file editor

export interface EditTreeNode {
  name: string
  path: string
  type: "file" | "directory"
  children?: EditTreeNode[]
}

export interface ListEditFilesResponse {
  path?: string
  label?: string
  tree?: EditTreeNode[]
  error?: string
}

export interface ReadEditFileResponse {
  content?: string
  path?: string
  filename?: string
  size?: number
  mtime?: number
  error?: string
  binary?: boolean
  extension?: string
  // Image response
  image?: boolean
  dataUrl?: string
}

export interface CheckMtimesResponse {
  results?: Array<{ path: string; changed: boolean; mtime: number; deleted?: boolean }>
  error?: string
}

export interface WriteEditFileResponse {
  success?: boolean
  message?: string
  path?: string
  size?: number
  mtime?: number
  error?: string
}

export async function listEditFiles(directory: string): Promise<ListEditFilesResponse> {
  const res = await fetch("/api/edit/list-files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ directory }),
  })
  return res.json()
}

export async function readEditFile(directory: string, path: string): Promise<ReadEditFileResponse> {
  const res = await fetch("/api/edit/read-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ directory, path }),
  })
  return res.json()
}

export async function writeEditFile(directory: string, path: string, content: string): Promise<WriteEditFileResponse> {
  const res = await fetch("/api/edit/write-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ directory, path, content }),
  })
  return res.json()
}

export async function checkMtimes(
  directory: string,
  files: Array<{ path: string; mtime: number }>,
): Promise<CheckMtimesResponse> {
  const res = await fetch("/api/edit/check-mtimes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ directory, files }),
  })
  return res.json()
}

export interface DeleteEditResponse {
  success?: boolean
  message?: string
  deletedPath?: string
  type?: "file" | "directory"
  error?: string
}

export async function deleteEditItem(directory: string, path: string): Promise<DeleteEditResponse> {
  const res = await fetch("/api/edit/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ directory, path }),
  })
  return res.json()
}

export interface CopyEditResponse {
  success?: boolean
  message?: string
  sourcePath?: string
  destPath?: string
  error?: string
}

export async function copyEditFile(directory: string, source: string, destination: string): Promise<CopyEditResponse> {
  const res = await fetch("/api/edit/copy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ directory, source, destination }),
  })
  return res.json()
}
