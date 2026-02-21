import { describe, expect, it } from "vitest"
import { generateRequestId, getRequestId, REQUEST_ID_HEADER } from "@/lib/request-id"

describe("request-id helper", () => {
  describe("REQUEST_ID_HEADER", () => {
    it("equals x-request-id", () => {
      expect(REQUEST_ID_HEADER).toBe("x-request-id")
    })
  })

  describe("generateRequestId", () => {
    it("returns a valid UUIDv4", () => {
      const id = generateRequestId()
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    })

    it("generates unique IDs", () => {
      const ids = new Set(Array.from({ length: 1000 }, () => generateRequestId()))
      expect(ids.size).toBe(1000)
    })
  })

  describe("getRequestId", () => {
    it("reads X-Request-Id from request headers", () => {
      const req = new Request("http://localhost/api/test", {
        headers: { "x-request-id": "my-custom-id" },
      })
      expect(getRequestId(req)).toBe("my-custom-id")
    })

    it("generates a new ID when header is absent", () => {
      const req = new Request("http://localhost/api/test")
      const id = getRequestId(req)
      expect(id).toBeTruthy()
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    })

    it("generates a new ID when header is empty string", () => {
      const req = new Request("http://localhost/api/test", {
        headers: { "x-request-id": "" },
      })
      const id = getRequestId(req)
      // Empty string is falsy, so a new UUID should be generated
      expect(id).toMatch(/^[0-9a-f]{8}-/)
    })
  })
})
