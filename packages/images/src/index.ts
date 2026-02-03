// Storage

export type { CompressOptions, CompressResult } from "./core/compress.js"
export { compressImage, generateVariant } from "./core/compress.js"
export { generateContentHash } from "./core/hash.js"
export { generateStorageKey, parseStorageKey } from "./core/keys.js"
// Core
export { uploadImage } from "./core/upload.js"
export type { FilesystemStorageConfig } from "./storage/filesystem.js"
export { FilesystemStorage } from "./storage/filesystem.js"
export { ImageStorage } from "./storage/interface.js"
export type { StorageConfig, UploadOptions, UploadResult, Variant } from "./types/config.js"

// Types
export type { HResponse } from "./types/response.js"
export { Rs } from "./types/response.js"
// Validation
export { getAllowedMimeTypes, validateImageType } from "./validation/magic-numbers.js"
export { MAX_FILE_SIZE, MIN_FILE_SIZE, validateFileSize } from "./validation/size-limits.js"
