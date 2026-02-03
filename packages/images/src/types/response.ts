/**
 * HResponse pattern for type-safe error handling
 * Inspired by Rust's Result type
 */
export type HResponse<T> = Promise<{ data: T; error: null } | { data: null; error: { message: string; code: string } }>

/**
 * Response builders
 */
export class Rs {
  static data<T>(data: T): { data: T; error: null } {
    return { data, error: null }
  }

  static error(message: string, code: string): { data: null; error: { message: string; code: string } } {
    return {
      data: null,
      error: { message, code },
    }
  }

  static fromError(error: unknown, code: string): { data: null; error: { message: string; code: string } } {
    const message = error instanceof Error ? error.message : String(error)
    return Rs.error(message, code)
  }
}
