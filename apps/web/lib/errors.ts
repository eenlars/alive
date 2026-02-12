export class HttpError extends Error {
  readonly status: number
  readonly statusText: string
  readonly errorCode?: string

  constructor(message: string, status: number, statusText: string, errorCode?: string) {
    super(message)
    this.name = "HttpError"
    this.status = status
    this.statusText = statusText
    this.errorCode = errorCode
  }
}

export function isAlreadyLogged(error: unknown): boolean {
  return error instanceof HttpError
}
