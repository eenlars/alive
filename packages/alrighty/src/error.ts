/**
 * Unified API error class with status helpers
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = "ApiError"
    // Fix prototype chain for ES5 targets
    Object.setPrototypeOf(this, ApiError.prototype)
  }

  get isUnauthorized(): boolean {
    return this.status === 401
  }

  get isForbidden(): boolean {
    return this.status === 403
  }

  get isNotFound(): boolean {
    return this.status === 404
  }

  get isServerError(): boolean {
    return this.status !== undefined && this.status >= 500
  }

  get isRateLimited(): boolean {
    return this.status === 429
  }

  get isClientError(): boolean {
    return this.status !== undefined && this.status >= 400 && this.status < 500
  }

  get isNetworkError(): boolean {
    return this.code === "NETWORK_ERROR"
  }

  get isValidationError(): boolean {
    return this.code === "VALIDATION_ERROR" || this.code === "REQUEST_VALIDATION_ERROR"
  }
}
