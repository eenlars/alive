export class NetworkError extends Error {
  constructor(
    message: string,
    public type: "offline" | "timeout" | "server" | "unknown",
    public status?: number,
  ) {
    super(message)
    this.name = "NetworkError"
  }
}

export interface FetchOptions extends RequestInit {
  timeout?: number
}

export async function fetchWithTimeout(url: string, options: FetchOptions = {}): Promise<Response> {
  const { timeout = 15000, ...fetchOptions } = options

  // Check if browser is offline before attempting request
  if (!navigator.onLine) {
    throw new NetworkError("You're currently offline. Please check your internet connection.", "offline")
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new NetworkError(`Server error (${response.status})`, "server", response.status)
    }

    return response
  } catch (error) {
    clearTimeout(timeoutId)

    // Handle abort (timeout)
    if (error instanceof Error && error.name === "AbortError") {
      throw new NetworkError("Request timed out. Please check your connection and try again.", "timeout")
    }

    // Handle network errors (DNS failure, no internet, etc.)
    if (error instanceof TypeError) {
      throw new NetworkError("Unable to reach server. Please check your internet connection.", "offline")
    }

    // Re-throw NetworkError as-is
    if (error instanceof NetworkError) {
      throw error
    }

    // Unknown error
    throw new NetworkError(error instanceof Error ? error.message : "An unexpected error occurred", "unknown")
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof NetworkError) {
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return "An unexpected error occurred"
}

export function getErrorType(error: unknown): "offline" | "timeout" | "server" | "unknown" {
  if (error instanceof NetworkError) {
    return error.type
  }
  return "unknown"
}
