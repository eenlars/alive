import type { NetworkRequest } from "./types"

export class StealthResponse {
  private _body: string
  private _headers: Headers
  private _status: number
  private _statusText: string
  private _url: string
  private _ok: boolean
  private _networkRequests?: NetworkRequest[]

  constructor(
    body: string,
    init: {
      status: number
      statusText: string
      headers: Record<string, string>
      url: string
      networkRequests?: NetworkRequest[]
    },
  ) {
    this._body = body
    this._status = init.status
    this._statusText = init.statusText
    this._url = init.url
    this._ok = init.status >= 200 && init.status < 300
    this._networkRequests = init.networkRequests

    // Convert headers object to Headers instance
    // Sanitize header values to handle multi-line values
    this._headers = new Headers()
    Object.entries(init.headers).forEach(([key, value]) => {
      // Replace newlines and consecutive spaces with a single space
      const sanitizedValue = value
        .replace(/[\r\n]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
      try {
        this._headers.set(key, sanitizedValue)
      } catch (error) {
        // Skip invalid headers silently
        console.warn(`Skipping invalid header ${key}: ${error}`)
      }
    })
  }

  get ok(): boolean {
    return this._ok
  }

  get status(): number {
    return this._status
  }

  get statusText(): string {
    return this._statusText
  }

  get headers(): Headers {
    return this._headers
  }

  get url(): string {
    return this._url
  }

  get networkRequests(): NetworkRequest[] | undefined {
    return this._networkRequests
  }

  async text(): Promise<string> {
    return this._body
  }

  async json<T = unknown>(): Promise<T> {
    try {
      return JSON.parse(this._body) as T
    } catch (error) {
      throw new Error(`Failed to parse response as JSON: ${error}`)
    }
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    const encoder = new TextEncoder()
    return encoder.encode(this._body).buffer
  }

  async blob(): Promise<Blob> {
    return new Blob([this._body], {
      type: this._headers.get("content-type") || "text/plain",
    })
  }

  clone(): StealthResponse {
    const headersObj: Record<string, string> = {}
    this._headers.forEach((value, key) => {
      headersObj[key] = value
    })
    return new StealthResponse(this._body, {
      status: this._status,
      statusText: this._statusText,
      headers: headersObj,
      url: this._url,
      networkRequests: this._networkRequests,
    })
  }
}
