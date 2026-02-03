export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly statusText: string,
    public readonly errorCode?: string,
  ) {
    super(message)
    this.name = "HttpError"
  }
}

export function isAlreadyLogged(error: unknown): boolean {
  return error instanceof HttpError
}
