import { describe, it, expect } from "vitest"
import {
  extractErrorCode,
  isAbortError,
  isFatalError,
  isConfigError,
  isTransientNetworkError,
  isRetryableNetworkError,
  formatUncaughtError,
} from "../errors"

describe("extractErrorCode", () => {
  it("should extract code from error with code property", () => {
    const err = { code: "ECONNRESET" }
    expect(extractErrorCode(err)).toBe("ECONNRESET")
  })

  it("should return undefined for null/undefined", () => {
    expect(extractErrorCode(null)).toBeUndefined()
    expect(extractErrorCode(undefined)).toBeUndefined()
  })

  it("should return undefined for error without code", () => {
    expect(extractErrorCode(new Error("test"))).toBeUndefined()
  })

  it("should return undefined for non-string code", () => {
    expect(extractErrorCode({ code: 123 })).toBeUndefined()
  })
})

describe("isAbortError", () => {
  it("should detect AbortError by name", () => {
    const err = new Error("aborted")
    err.name = "AbortError"
    expect(isAbortError(err)).toBe(true)
  })

  it("should detect undici abort message", () => {
    const err = new Error("This operation was aborted")
    expect(isAbortError(err)).toBe(true)
  })

  it("should return false for regular errors", () => {
    expect(isAbortError(new Error("test"))).toBe(false)
    expect(isAbortError(null)).toBe(false)
    expect(isAbortError(undefined)).toBe(false)
  })
})

describe("isFatalError", () => {
  it("should detect fatal error codes", () => {
    const err = { code: "ERR_OUT_OF_MEMORY" }
    expect(isFatalError(err)).toBe(true)
  })

  it("should detect fatal error in cause", () => {
    const err = { cause: { code: "ERR_OUT_OF_MEMORY" } }
    expect(isFatalError(err)).toBe(true)
  })

  it("should return false for non-fatal errors", () => {
    expect(isFatalError(new Error("test"))).toBe(false)
    expect(isFatalError({ code: "ECONNRESET" })).toBe(false)
  })
})

describe("isConfigError", () => {
  it("should detect config error codes", () => {
    expect(isConfigError({ code: "INVALID_CONFIG" })).toBe(true)
    expect(isConfigError({ code: "MISSING_API_KEY" })).toBe(true)
    expect(isConfigError({ code: "MISSING_CREDENTIALS" })).toBe(true)
  })

  it("should return false for non-config errors", () => {
    expect(isConfigError(new Error("test"))).toBe(false)
    expect(isConfigError({ code: "ECONNRESET" })).toBe(false)
  })
})

describe("isTransientNetworkError", () => {
  it("should detect standard network error codes", () => {
    expect(isTransientNetworkError({ code: "ECONNRESET" })).toBe(true)
    expect(isTransientNetworkError({ code: "ECONNREFUSED" })).toBe(true)
    expect(isTransientNetworkError({ code: "ETIMEDOUT" })).toBe(true)
    expect(isTransientNetworkError({ code: "ENOTFOUND" })).toBe(true)
  })

  it("should detect undici error codes", () => {
    expect(isTransientNetworkError({ code: "UND_ERR_CONNECT_TIMEOUT" })).toBe(true)
    expect(isTransientNetworkError({ code: "UND_ERR_SOCKET" })).toBe(true)
  })

  it("should detect fetch failed TypeError", () => {
    const err = new TypeError("fetch failed")
    expect(isTransientNetworkError(err)).toBe(true)
  })

  it("should check cause chain", () => {
    const err = { cause: { code: "ECONNRESET" } }
    expect(isTransientNetworkError(err)).toBe(true)
  })

  it("should handle AggregateError", () => {
    const aggregateErr = new AggregateError([{ code: "ECONNRESET" }])
    expect(isTransientNetworkError(aggregateErr)).toBe(true)
  })

  it("should return false for non-transient errors", () => {
    expect(isTransientNetworkError(null)).toBe(false)
    expect(isTransientNetworkError(new Error("test"))).toBe(false)
    expect(isTransientNetworkError({ code: "ERR_OUT_OF_MEMORY" })).toBe(false)
  })
})

describe("isRetryableNetworkError", () => {
  it("should mark transient network errors as retryable", () => {
    expect(isRetryableNetworkError({ code: "ECONNRESET" })).toBe(true)
    expect(isRetryableNetworkError({ code: "ETIMEDOUT" })).toBe(true)
  })

  it("should mark 5xx errors as retryable", () => {
    expect(isRetryableNetworkError({ status: 500 })).toBe(true)
    expect(isRetryableNetworkError({ status: 502 })).toBe(true)
    expect(isRetryableNetworkError({ status: 503 })).toBe(true)
  })

  it("should mark 429 (rate limit) as retryable", () => {
    expect(isRetryableNetworkError({ status: 429 })).toBe(true)
  })

  it("should not mark 4xx errors as retryable", () => {
    expect(isRetryableNetworkError({ status: 400 })).toBe(false)
    expect(isRetryableNetworkError({ status: 401 })).toBe(false)
    expect(isRetryableNetworkError({ status: 404 })).toBe(false)
  })

  it("should not mark abort errors as retryable", () => {
    const abortErr = new Error("aborted")
    abortErr.name = "AbortError"
    expect(isRetryableNetworkError(abortErr)).toBe(false)
  })
})

describe("formatUncaughtError", () => {
  it("should format Error with stack", () => {
    const err = new Error("test error")
    const formatted = formatUncaughtError(err)
    expect(formatted).toContain("test error")
    expect(formatted).toContain("Error")
  })

  it("should format string", () => {
    expect(formatUncaughtError("test string")).toBe("test string")
  })

  it("should format object as JSON", () => {
    const obj = { foo: "bar" }
    expect(formatUncaughtError(obj)).toBe('{"foo":"bar"}')
  })

  it("should handle non-serializable objects", () => {
    const circular: { self?: unknown } = {}
    circular.self = circular
    const formatted = formatUncaughtError(circular)
    expect(formatted).toBe("[object Object]")
  })
})
