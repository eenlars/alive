/**
 * Upload handler with progress tracking, retry logic, and error categorization
 */

export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
}

export interface UploadOptions {
  workspace?: string
  worktree?: string | null
  isTerminal?: boolean
  onProgress?: (progress: UploadProgress) => void
  signal?: AbortSignal
  maxRetries?: number
}

export enum UploadErrorType {
  NETWORK_ERROR = "NETWORK_ERROR",
  FILE_TOO_LARGE = "FILE_TOO_LARGE",
  UNAUTHORIZED = "UNAUTHORIZED",
  SERVER_ERROR = "SERVER_ERROR",
  ABORTED = "ABORTED",
  UNKNOWN = "UNKNOWN",
}

export class UploadError extends Error {
  constructor(
    message: string,
    public type: UploadErrorType,
    public originalError?: unknown,
  ) {
    super(message)
    this.name = "UploadError"
  }
}

/**
 * Categorize upload errors into user-friendly types
 */
function categorizeError(error: unknown, status?: number): UploadError {
  const errorObj = error as Record<string, any>

  // Abort signal
  if (errorObj?.name === "AbortError" || String(errorObj?.message || "").includes("aborted")) {
    return new UploadError("Upload cancelled", UploadErrorType.ABORTED, error)
  }

  // Network errors
  if (String(errorObj?.message || "").includes("fetch") || String(errorObj?.message || "").includes("network")) {
    return new UploadError("Network error - check your connection and try again", UploadErrorType.NETWORK_ERROR, error)
  }

  // HTTP status errors
  if (status) {
    if (status === 401 || status === 403) {
      return new UploadError("Session expired - please refresh the page", UploadErrorType.UNAUTHORIZED, error)
    }

    if (status === 413) {
      return new UploadError("File too large (max 20MB)", UploadErrorType.FILE_TOO_LARGE, error)
    }

    if (status >= 500) {
      return new UploadError("Server error - please try again", UploadErrorType.SERVER_ERROR, error)
    }
  }

  // Default
  return new UploadError(
    String(errorObj?.message || "Upload failed - please try again"),
    UploadErrorType.UNKNOWN,
    error,
  )
}

/**
 * Check if error is retryable
 */
function isRetryable(error: UploadError): boolean {
  return error.type === UploadErrorType.NETWORK_ERROR || error.type === UploadErrorType.SERVER_ERROR
}

/**
 * Upload file with progress tracking and retry logic using XMLHttpRequest
 */
async function uploadWithProgress(file: File, options: UploadOptions, attempt: number = 1): Promise<string> {
  const maxRetries = options.maxRetries ?? 3

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append("file", file)

    // Add workspace if in terminal mode
    if (options.isTerminal && options.workspace) {
      formData.append("workspace", options.workspace)
    }
    if (options.isTerminal && options.worktree) {
      formData.append("worktree", options.worktree)
    }

    // Track upload progress
    xhr.upload.onprogress = e => {
      if (e.lengthComputable && options.onProgress) {
        options.onProgress({
          loaded: e.loaded,
          total: e.total,
          percentage: Math.round((e.loaded / e.total) * 100),
        })
      }
    }

    // Handle completion
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result = JSON.parse(xhr.responseText)
          resolve(result.data.key)
        } catch (error) {
          reject(categorizeError(error, xhr.status))
        }
      } else {
        const error = categorizeError(new Error(xhr.statusText), xhr.status)

        // Retry if retryable and attempts remaining
        if (isRetryable(error) && attempt < maxRetries) {
          const delay = Math.min(1000 * 2 ** (attempt - 1), 5000)
          console.log(`[Upload] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`)

          setTimeout(() => {
            uploadWithProgress(file, options, attempt + 1)
              .then(resolve)
              .catch(reject)
          }, delay)
        } else {
          reject(error)
        }
      }
    }

    // Handle network errors
    xhr.onerror = () => {
      const error = categorizeError(new Error("Network error"), undefined)

      // Retry if attempts remaining
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * 2 ** (attempt - 1), 5000)
        console.log(`[Upload] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`)

        setTimeout(() => {
          uploadWithProgress(file, options, attempt + 1)
            .then(resolve)
            .catch(reject)
        }, delay)
      } else {
        reject(error)
      }
    }

    // Handle abort
    xhr.onabort = () => {
      reject(categorizeError(new Error("Upload aborted"), undefined))
    }

    // Hook up abort signal
    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        xhr.abort()
      })
    }

    // Send request
    xhr.open("POST", "/api/images/upload")
    xhr.send(formData)
  })
}

/**
 * Main upload handler with error categorization
 */
export async function uploadImage(file: File, options: UploadOptions = {}): Promise<string> {
  try {
    return await uploadWithProgress(file, options)
  } catch (error) {
    if (error instanceof UploadError) {
      throw error
    }
    throw categorizeError(error)
  }
}
