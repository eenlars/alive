/**
 * Tests for Manager Templates API
 *
 * Tests the /api/manager/templates CRUD endpoints
 */

import type { RequestInit as NextRequestInit } from "next/dist/server/web/spec-extension/request"
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock manager auth helper
vi.mock("@/features/manager/lib/api-helpers", () => ({
  requireManagerAuth: vi.fn(),
}))

// Mock Supabase app client
vi.mock("@/lib/supabase/app", () => ({
  createAppClient: vi.fn(),
}))

// Import after mocking
const { GET, POST, PUT, DELETE } = await import("../route")
const { requireManagerAuth } = await import("@/features/manager/lib/api-helpers")
const { createAppClient } = await import("@/lib/supabase/app")

function createMockRequest(
  url: string,
  options: { method?: string; body?: object; headers?: Record<string, string> } = {},
): NextRequest {
  const init: NextRequestInit = {
    method: options.method || "GET",
    headers: options.headers || {},
  }
  if (options.body) {
    init.body = JSON.stringify(options.body)
    ;(init.headers as Record<string, string>)["Content-Type"] = "application/json"
  }
  return new NextRequest(url, init)
}

function setupSupabaseMock(options: {
  selectResult?: { data: unknown[] | null; error: { message: string } | null }
  insertResult?: { data: unknown | null; error: { message: string } | null }
  updateResult?: { data: unknown | null; error: { message: string } | null }
  deleteResult?: { error: { message: string } | null }
}) {
  const mockFrom = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue(options.selectResult || { data: [], error: null }),
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(options.updateResult || { data: null, error: null }),
        }),
      }),
      single: vi.fn().mockResolvedValue(options.selectResult || { data: null, error: null }),
    }),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(options.insertResult || { data: null, error: null }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(options.updateResult || { data: null, error: null }),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(options.deleteResult || { error: null }),
    }),
  })

  ;(createAppClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    from: mockFrom,
  })

  return mockFrom
}

describe("/api/manager/templates", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("GET - List templates", () => {
    it("should return 401 when not authenticated", async () => {
      const mockResponse = new Response(JSON.stringify({ ok: false, error: "UNAUTHORIZED" }), { status: 401 })
      ;(requireManagerAuth as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse)

      const req = createMockRequest("http://localhost/api/manager/templates")
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.ok).toBe(false)
    })

    it("should return templates when authenticated", async () => {
      ;(requireManagerAuth as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      const mockTemplates = [
        { template_id: "tmpl_test", name: "Test", source_path: "/srv/webalive/sites/test.alive.best" },
      ]
      setupSupabaseMock({
        selectResult: { data: mockTemplates, error: null },
      })

      const req = createMockRequest("http://localhost/api/manager/templates")
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.templates).toEqual(mockTemplates)
      expect(data.count).toBe(1)
    })

    it("should return 500 on database error", async () => {
      ;(requireManagerAuth as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      setupSupabaseMock({
        selectResult: { data: null, error: { message: "Database error" } },
      })

      const req = createMockRequest("http://localhost/api/manager/templates")
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.ok).toBe(false)
    })
  })

  describe("POST - Create template", () => {
    it("should return 401 when not authenticated", async () => {
      const mockResponse = new Response(JSON.stringify({ ok: false, error: "UNAUTHORIZED" }), { status: 401 })
      ;(requireManagerAuth as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse)

      const req = createMockRequest("http://localhost/api/manager/templates", {
        method: "POST",
        body: { name: "Test", source_path: "/srv/test" },
      })
      const response = await POST(req)

      expect(response.status).toBe(401)
    })

    it("should return 400 when name is missing", async () => {
      ;(requireManagerAuth as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      const req = createMockRequest("http://localhost/api/manager/templates", {
        method: "POST",
        body: { source_path: "/srv/test" },
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.ok).toBe(false)
    })

    it("should create template successfully", async () => {
      ;(requireManagerAuth as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      const newTemplate = {
        template_id: "tmpl_new",
        name: "New Template",
        source_path: "/srv/webalive/sites/new.alive.best",
      }
      setupSupabaseMock({
        insertResult: { data: newTemplate, error: null },
      })

      const req = createMockRequest("http://localhost/api/manager/templates", {
        method: "POST",
        body: { name: "New Template", source_path: "/srv/webalive/sites/new.alive.best" },
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.template).toEqual(newTemplate)
    })
  })

  describe("PUT - Update template", () => {
    it("should return 400 when template_id is missing", async () => {
      ;(requireManagerAuth as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      const req = createMockRequest("http://localhost/api/manager/templates", {
        method: "PUT",
        body: { name: "Updated" },
      })
      const response = await PUT(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.ok).toBe(false)
    })

    it("should update template successfully", async () => {
      ;(requireManagerAuth as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      const updatedTemplate = { template_id: "tmpl_test", name: "Updated" }
      setupSupabaseMock({
        updateResult: { data: updatedTemplate, error: null },
      })

      const req = createMockRequest("http://localhost/api/manager/templates", {
        method: "PUT",
        body: { template_id: "tmpl_test", name: "Updated" },
      })
      const response = await PUT(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.template).toEqual(updatedTemplate)
    })
  })

  describe("DELETE - Delete template", () => {
    it("should return 400 when template_id is missing", async () => {
      ;(requireManagerAuth as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      const req = createMockRequest("http://localhost/api/manager/templates", { method: "DELETE" })
      const response = await DELETE(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.ok).toBe(false)
    })

    it("should delete template successfully", async () => {
      ;(requireManagerAuth as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      setupSupabaseMock({
        deleteResult: { error: null },
      })

      const req = createMockRequest("http://localhost/api/manager/templates?template_id=tmpl_test", {
        method: "DELETE",
      })
      const response = await DELETE(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.deleted).toBe(true)
      expect(data.template_id).toBe("tmpl_test")
    })
  })
})
