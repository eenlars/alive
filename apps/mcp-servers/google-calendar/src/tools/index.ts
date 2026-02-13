/**
 * Google Calendar MCP Tools
 *
 * Tool definitions and execution handlers for Google Calendar operations.
 *
 * DISABLED TOOLS (only available via REST API after user confirms):
 * - create_event: Disabled for MCP - only available via REST API /api/google/calendar/create-event
 * - update_event: Disabled for MCP - only available via REST API /api/google/calendar/update-event
 * - delete_event: Disabled for MCP - only available via REST API /api/google/calendar/delete-event
 *
 * ENABLED TOOLS (available to Claude via MCP):
 * - list_calendars: Get user's calendars
 * - list_events: List events in a calendar
 * - get_event: Get detailed event info
 * - search_events: Search events by keyword
 * - check_availability: Get free/busy for scheduling
 * - compose_calendar_event: Return draft event data (does NOT create)
 */

import type { calendar_v3 } from "@googleapis/calendar"
import { checkAvailability, getEvent, listCalendars, listEvents, searchEvents } from "../calendar-client.js"
import type { EventDraft, MeetingSuggestion } from "../types.js"
import {
  EventDraftSchema,
  FreeBusyQuerySchema,
  ListEventsSchema,
  MeetingSuggestionSchema,
  SearchEventsSchema,
} from "../types.js"

// Tools disabled for MCP (only available via REST API)
// User must click to create/update/delete - Claude cannot modify calendar directly
const DISABLED_TOOLS = new Set(["create_event", "update_event", "delete_event"])

// All tool definitions (including disabled ones for reference)
const allTools = [
  {
    name: "list_calendars",
    description:
      "List all calendars the user has access to, including primary calendar and shared calendars. Returns calendar IDs needed for other operations.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "list_events",
    description:
      "List events in a calendar within a date range. Use this to see what's scheduled, find free time, or check for conflicts.",
    inputSchema: {
      type: "object" as const,
      properties: {
        calendarId: {
          type: "string",
          description: "Calendar ID (e.g., 'primary' or email address). Default: 'primary'",
          default: "primary",
        },
        timeMin: {
          type: "string",
          description: "Start of time range (ISO 8601 format, e.g., '2024-02-13T00:00:00Z')",
        },
        timeMax: {
          type: "string",
          description: "End of time range (ISO 8601 format)",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of events to return (1-250, default: 25)",
          default: 25,
        },
        showDeleted: {
          type: "boolean",
          description: "Include deleted events (default: false)",
          default: false,
        },
      },
      required: [],
    },
  },
  {
    name: "get_event",
    description: "Get full details of a specific event, including attendees, location, and meeting links.",
    inputSchema: {
      type: "object" as const,
      properties: {
        calendarId: {
          type: "string",
          description: "Calendar ID (e.g., 'primary')",
        },
        eventId: {
          type: "string",
          description: "Event ID",
        },
      },
      required: ["calendarId", "eventId"],
    },
  },
  {
    name: "search_events",
    description:
      "Search events by text query (title, description, location, attendee names). Useful for finding specific events.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search term (e.g., 'meeting with Alice', 'project review')",
        },
        calendarId: {
          type: "string",
          description: "Calendar ID to search in (default: 'primary')",
          default: "primary",
        },
        timeMin: {
          type: "string",
          description: "Optional: search from this time onwards (ISO 8601)",
        },
        timeMax: {
          type: "string",
          description: "Optional: search up to this time (ISO 8601)",
        },
        maxResults: {
          type: "number",
          description: "Maximum results to return (1-250, default: 10)",
          default: 10,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "check_availability",
    description:
      "Check free/busy availability for one or more calendars over a time period. Use this for scheduling and conflict detection.",
    inputSchema: {
      type: "object" as const,
      properties: {
        calendarIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of calendar IDs to check (e.g., ['primary', 'alice@example.com'])",
        },
        timeMin: {
          type: "string",
          description: "Start time (ISO 8601 format, e.g., '2024-02-13T08:00:00Z')",
        },
        timeMax: {
          type: "string",
          description: "End time (ISO 8601 format)",
        },
      },
      required: ["calendarIds", "timeMin", "timeMax"],
    },
  },
  {
    name: "compose_calendar_event",
    description:
      "Compose a calendar event for the user to review. Returns structured event data that displays as an editable card with a Create Event button. The user must click Create Event - this tool does NOT create anything automatically. Use this when the user asks you to schedule/propose/draft an event.",
    inputSchema: {
      type: "object" as const,
      properties: {
        summary: {
          type: "string",
          description: "Event title (required)",
        },
        description: {
          type: "string",
          description: "Event description (optional)",
        },
        start: {
          type: "object",
          properties: {
            dateTime: {
              type: "string",
              description: "Start time in ISO 8601 format (e.g., '2024-02-13T15:30:00')",
            },
            timeZone: {
              type: "string",
              description: "Timezone (e.g., 'America/New_York', optional)",
            },
          },
          required: ["dateTime"],
        },
        end: {
          type: "object",
          properties: {
            dateTime: {
              type: "string",
              description: "End time in ISO 8601 format",
            },
            timeZone: {
              type: "string",
              description: "Timezone (optional)",
            },
          },
          required: ["dateTime"],
        },
        location: {
          type: "string",
          description: "Event location (optional)",
        },
        attendees: {
          type: "array",
          items: {
            type: "object",
            properties: {
              email: {
                type: "string",
                description: "Attendee email address",
              },
              optional: {
                type: "boolean",
                description: "Is this attendee optional (default: false)",
              },
            },
            required: ["email"],
          },
          description: "List of attendees (optional)",
        },
        calendarId: {
          type: "string",
          description: "Which calendar to create in (default: 'primary')",
          default: "primary",
        },
        transparency: {
          type: "string",
          enum: ["opaque", "transparent"],
          description: "Show as busy or free (default: 'opaque' = busy)",
          default: "opaque",
        },
      },
      required: ["summary", "start", "end"],
    },
  },
  {
    name: "propose_meeting",
    description:
      "Suggest a meeting with attendees and proposed times. Returns meeting proposal data for user review. The user must click to schedule.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "Meeting title",
        },
        description: {
          type: "string",
          description: "Meeting description (optional)",
        },
        attendees: {
          type: "array",
          items: {
            type: "object",
            properties: {
              email: {
                type: "string",
                description: "Attendee email",
              },
              displayName: {
                type: "string",
                description: "Display name (optional)",
              },
            },
            required: ["email"],
          },
          description: "List of attendees",
        },
        suggestedTimes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              start: {
                type: "string",
                description: "Start time (ISO 8601)",
              },
              end: {
                type: "string",
                description: "End time (ISO 8601)",
              },
              reason: {
                type: "string",
                description: "Why this time was suggested",
              },
            },
            required: ["start", "end", "reason"],
          },
          description: "Array of time options, each with start, end, and reason",
        },
        location: {
          type: "string",
          description: "Meeting location (optional)",
        },
        conferenceType: {
          type: "string",
          enum: ["googleMeet", "none"],
          description: "Add Google Meet link or none (default: 'none')",
          default: "none",
        },
      },
      required: ["title", "attendees", "suggestedTimes"],
    },
  },
  // Disabled tools (for reference)
  {
    name: "create_event",
    description: "DISABLED: Create an event. Use compose_calendar_event instead - user must click Create Event.",
    inputSchema: {
      type: "object" as const,
      properties: {
        calendarId: { type: "string" },
        eventData: { type: "object" },
      },
      required: ["calendarId", "eventData"],
    },
  },
  {
    name: "update_event",
    description: "DISABLED: Update an event. Use compose_calendar_event instead - user must click Update.",
    inputSchema: {
      type: "object" as const,
      properties: {
        calendarId: { type: "string" },
        eventId: { type: "string" },
        eventData: { type: "object" },
      },
      required: ["calendarId", "eventId", "eventData"],
    },
  },
  {
    name: "delete_event",
    description: "DISABLED: Delete an event. Only available via REST API after user confirms.",
    inputSchema: {
      type: "object" as const,
      properties: {
        calendarId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["calendarId", "eventId"],
    },
  },
]

// Export only enabled tools
export const tools = allTools.filter(tool => !DISABLED_TOOLS.has(tool.name))

/**
 * Execute a calendar tool
 */
export async function executeTool(
  cal: calendar_v3.Calendar,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{
  content: Array<{ type: string; text: string }>
  isError?: boolean
}> {
  try {
    // Check if tool is disabled
    if (DISABLED_TOOLS.has(toolName)) {
      return {
        content: [
          {
            type: "text",
            text: `Error: The '${toolName}' tool is disabled for MCP. Use the appropriate UI component instead - user must confirm before modifications are made.`,
          },
        ],
        isError: true,
      }
    }

    let result: unknown

    switch (toolName) {
      case "list_calendars": {
        const calendars = await listCalendars(cal)
        result = calendars
        break
      }

      case "list_events": {
        const validated = ListEventsSchema.parse(args)
        const events = await listEvents(cal, validated.calendarId, {
          timeMin: validated.timeMin,
          timeMax: validated.timeMax,
          maxResults: validated.maxResults,
          showDeleted: validated.showDeleted,
        })
        result = events
        break
      }

      case "get_event": {
        const { calendarId, eventId } = args as { calendarId: string; eventId: string }
        if (!calendarId || !eventId) {
          throw new Error("calendarId and eventId are required")
        }
        const event = await getEvent(cal, calendarId, eventId)
        result = event
        break
      }

      case "search_events": {
        const validated = SearchEventsSchema.parse(args)
        const events = await searchEvents(cal, validated.calendarId, validated.query, {
          timeMin: validated.timeMin,
          timeMax: validated.timeMax,
          maxResults: validated.maxResults,
        })
        result = events
        break
      }

      case "check_availability": {
        const validated = FreeBusyQuerySchema.parse(args)
        const availability = await checkAvailability(cal, validated.calendarIds, validated.timeMin, validated.timeMax)
        result = availability
        break
      }

      case "compose_calendar_event": {
        const validated = EventDraftSchema.parse(args)
        // Return the draft as-is for UI to render
        result = validated as EventDraft
        break
      }

      case "propose_meeting": {
        const validated = MeetingSuggestionSchema.parse(args)
        result = validated
        break
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
          isError: true,
        }
    }

    // Return result as JSON string
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      content: [
        {
          type: "text",
          text: `Error executing ${toolName}: ${errorMessage}`,
        },
      ],
      isError: true,
    }
  }
}
