import type { DeleteResponse, ListFilesResponse, ReadFileResponse } from "../types/api"

export async function listFiles(workspace: string): Promise<ListFilesResponse> {
  const formData = new FormData()
  formData.append("workspace", workspace)
  const res = await fetch("/api/list-files", { method: "POST", body: formData })
  return res.json()
}

export async function readFile(workspace: string, path: string): Promise<ReadFileResponse> {
  const formData = new FormData()
  formData.append("workspace", workspace)
  formData.append("path", path)
  const res = await fetch("/api/read-file", { method: "POST", body: formData })
  return res.json()
}

export async function deleteItem(workspace: string, path: string): Promise<DeleteResponse> {
  const formData = new FormData()
  formData.append("workspace", workspace)
  formData.append("path", path)
  const res = await fetch("/api/delete-folder", { method: "POST", body: formData })
  return res.json()
}

export function downloadFile(workspace: string, path: string): void {
  const params = new URLSearchParams({ workspace, path })
  const url = `/api/download-file?${params.toString()}`
  // Create a temporary anchor element to trigger download
  const a = document.createElement("a")
  a.href = url
  a.download = path.split("/").pop() || "download"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
