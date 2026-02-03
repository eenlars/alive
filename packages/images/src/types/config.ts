export interface StorageConfig {
  basePath: string
  maxFileSize?: number
  allowedMimeTypes?: string[]
}

export interface UploadOptions {
  visibility?: "public" | "private"
  variants?: Variant[]
  compress?: boolean
  maxWidth?: number
  targetSize?: number
}

export type Variant = "orig" | "w640" | "w1280" | "thumb"

export interface UploadResult {
  contentHash: string
  keys: Record<Variant, string>
  urls: Record<Variant, string>
  width: number
  height: number
  fileSize: number
}
