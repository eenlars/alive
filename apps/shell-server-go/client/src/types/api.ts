/**
 * API response types
 */

import type { ApiTreeNode } from "./domain"

export interface SitesResponse {
  sites: string[]
  sitesPath: string
  error?: string
}

export interface CheckDirectoryResponse {
  exists: boolean
  path: string
  message: string
  error?: string
}

export interface CreateDirectoryResponse {
  success: boolean
  message: string
  path: string
  created: boolean
  error?: string
}

export interface UploadResponse {
  success?: boolean
  message?: string
  error?: string
  details?: string[]
  targetDir?: string
  zipContents?: string[]
  hint?: string
  existingItems?: string[]
  extractedTo?: string
  fileCount?: number
  /** Filename (for non-ZIP uploads) */
  filename?: string
}

/** Raw API response - use transformApiTree to convert to TreeNode[] */
export interface ListFilesResponse {
  path: string
  tree: ApiTreeNode[]
  error?: string
}

export interface ReadFileResponse {
  content: string
  path: string
  filename: string
  size: number
  error?: string
  binary?: boolean
  extension?: string
}

export interface DeleteResponse {
  success: boolean
  message: string
  deletedPath?: string
  type?: "file" | "directory"
  error?: string
}
