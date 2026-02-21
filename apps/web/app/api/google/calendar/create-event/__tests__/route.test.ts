import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockInsert = vi.fn()
const mockSetCredentials = vi.fn()
const mockGetAccessToken = vi.fn()

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}))

vi.mock("@/features/auth/lib/auth", () => ({
  getSessionUser: vi.fn(),
}))

vi.mock("@/lib/api/responses", async () => {
  const { NextResponse } = await import("next/server")
  return {
    structuredErrorResponse: vi.fn((code, { status, details }) => {
      return NextResponse.json({ ok: false, error: code, ...details }, { status })
    }),
  }
})

vi.mock("@/lib/oauth/oauth-instances", () => ({
  getOAuthInstance: vi.fn(() => ({
    getAccessToken: mockGetAccessToken,
  })),
}))

vi.mock("@googleapis/calendar", () => {
  class MockOAuth2 {
    setCredentials = mockSetCredentials
  }

  class MockCalendar {
    events = {
      insert: mockInsert,
    }
  }

  return {
    auth: {
      OAuth2: MockOAuth2,
    },
    calendar_v3: {
      Calendar: MockCalendar,
    },
  }
})

const { POST } = await import("../route")
const { getSessionUser } = await import("@/features/auth/lib/auth")
const { getOAuthInstance } = await import("@/lib/oauth/oauth-instances")

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/google/calendar/create-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/google/calendar/create-event", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(getSessionUser).mockResolvedValue({ id: "user-123" } as never)
    vi.mocked(getOAuthInstance).mockReturnValue({ getAccessToken: mockGetAccessToken } as never)

    mockGetAccessToken.mockResolvedValue("token-123")
    mockInsert.mockResolvedValue({
      data: {
        id: "evt_123",
        htmlLink: "https://calendar.google.com/event?eid=evt_123",
      },
    })
  })

  it("returns 401 when user is not authenticated", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)

    const response = await POST(
      createRequest({
        summary: "Planning",
        start: { dateTime: "2026-02-18T09:00:00Z" },
        end: { dateTime: "2026-02-18T09:30:00Z" },
      }),
    )

    expect(response.status).toBe(401)
    const data = await response.json()
    expect(data.ok).toBe(false)
    expect(data.error).toBe("UNAUTHORIZED")
  })

  it("creates an event successfully", async () => {
    const response = await POST(
      createRequest({
        summary: "Planning",
        description: "Sprint planning",
        start: { dateTime: "2026-02-18T09:00:00Z" },
        end: { dateTime: "2026-02-18T09:30:00Z" },
        attendees: [{ email: "alice@example.com" }],
      }),
    )

    expect(response.status).toBe(200)

    const data = (await response.json()) as {
      ok: boolean
      eventId: string
      calendarId: string
      htmlLink: string
    }

    expect(data.ok).toBe(true)
    expect(data.eventId).toBe("evt_123")
    expect(data.calendarId).toBe("primary")
    expect(data.htmlLink).toContain("calendar.google.com")

    expect(mockGetAccessToken).toHaveBeenCalledWith("user-123", "google")
    expect(mockSetCredentials).toHaveBeenCalledWith({ access_token: "token-123" })
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: "primary",
        requestBody: expect.objectContaining({
          summary: "Planning",
          start: { dateTime: "2026-02-18T09:00:00Z", timeZone: undefined },
          end: { dateTime: "2026-02-18T09:30:00Z", timeZone: undefined },
        }),
      }),
    )
  })

  it("returns 400 for invalid datetime payload", async () => {
    const response = await POST(
      createRequest({
        summary: "Planning",
        start: { dateTime: "2026-02-18T09:00:00" },
        end: { dateTime: "2026-02-18T09:30:00" },
      }),
    )

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.ok).toBe(false)
    expect(data.error).toBe("INVALID_REQUEST")
    expect(data.reason).toBe("Start must be ISO 8601 datetime")
  })

  it("returns 400 when start is after end", async () => {
    const response = await POST(
      createRequest({
        summary: "Planning",
        start: { dateTime: "2026-02-18T10:00:00Z" },
        end: { dateTime: "2026-02-18T09:00:00Z" },
      }),
    )

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.ok).toBe(false)
    expect(data.error).toBe("INVALID_REQUEST")
    expect(data.reason).toBe("Event start time must be before end time")
  })

  it("returns 403 when Google Calendar is not connected", async () => {
    mockGetAccessToken.mockRejectedValueOnce(new Error("missing oauth"))

    const response = await POST(
      createRequest({
        summary: "Planning",
        start: { dateTime: "2026-02-18T09:00:00Z" },
        end: { dateTime: "2026-02-18T09:30:00Z" },
      }),
    )

    expect(response.status).toBe(403)
    const data = await response.json()
    expect(data.ok).toBe(false)
    expect(data.error).toBe("INTEGRATION_ERROR")
  })

  it("returns 500 when Google API does not return event ID", async () => {
    mockInsert.mockResolvedValueOnce({ data: { htmlLink: "https://calendar.google.com/event" } })

    const response = await POST(
      createRequest({
        summary: "Planning",
        start: { dateTime: "2026-02-18T09:00:00Z" },
        end: { dateTime: "2026-02-18T09:30:00Z" },
      }),
    )

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.ok).toBe(false)
    expect(data.error).toBe("INTEGRATION_ERROR")
  })
})
