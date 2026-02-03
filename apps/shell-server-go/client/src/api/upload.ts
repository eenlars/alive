import type { CheckDirectoryResponse, CreateDirectoryResponse, UploadResponse } from "../types/api"

export async function checkDirectory(workspace: string, targetDir: string): Promise<CheckDirectoryResponse> {
  const formData = new FormData()
  formData.append("workspace", workspace)
  formData.append("targetDir", targetDir || "./")
  const res = await fetch("/api/check-directory", { method: "POST", body: formData })
  return res.json()
}

export async function createDirectory(workspace: string, targetDir: string): Promise<CreateDirectoryResponse> {
  const formData = new FormData()
  formData.append("workspace", workspace)
  formData.append("targetDir", targetDir)
  const res = await fetch("/api/create-directory", { method: "POST", body: formData })
  return res.json()
}

export interface UploadOptions {
  file: File
  workspace: string
  targetDir: string
  /** Custom filename for non-ZIP files (optional) */
  customName?: string
  onProgress?: (progress: number) => void
}

export async function uploadFile(
  file: File,
  workspace: string,
  targetDir: string,
  onProgress?: (progress: number) => void,
): Promise<UploadResponse>

export async function uploadFile(options: UploadOptions): Promise<UploadResponse>

export async function uploadFile(
  fileOrOptions: File | UploadOptions,
  workspace?: string,
  targetDir?: string,
  onProgress?: (progress: number) => void,
): Promise<UploadResponse> {
  // Handle both calling conventions
  let file: File
  let ws: string
  let dir: string
  let customName: string | undefined
  let progressCb: ((progress: number) => void) | undefined

  if (fileOrOptions instanceof File) {
    file = fileOrOptions
    ws = workspace!
    dir = targetDir!
    progressCb = onProgress
  } else {
    file = fileOrOptions.file
    ws = fileOrOptions.workspace
    dir = fileOrOptions.targetDir
    customName = fileOrOptions.customName
    progressCb = fileOrOptions.onProgress
  }

  const formData = new FormData()
  formData.append("file", file)
  formData.append("workspace", ws)
  formData.append("targetDir", dir || "./")
  if (customName) {
    formData.append("name", customName)
  }

  progressCb?.(30)
  const res = await fetch("/api/upload", { method: "POST", body: formData })
  progressCb?.(90)
  const result = await res.json()
  progressCb?.(100)
  return result
}
