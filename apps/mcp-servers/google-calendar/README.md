# Google Calendar MCP Server

A Model Context Protocol (MCP) server for Google Calendar integration in Alive. Enables Claude to help with calendar management through read operations, event composition, and meeting suggestions.

## Features

- **List Calendars**: Get user's calendars and shared calendars
- **List Events**: View events in a calendar within a date range
- **Get Event**: Retrieve full event details including attendees and meeting links
- **Search Events**: Find events by text query
- **Check Availability**: Check free/busy availability for scheduling
- **Compose Event**: Draft events for user to review and confirm
- **Propose Meeting**: Suggest meetings with multiple time options

## Design Principles

### Read Operations Only in MCP
- Claude can list, get, and search events
- Claude can compose event drafts (JSON data)
- Claude cannot directly create, update, or delete events

### User-Confirmed Actions via REST
- Event creation/updates/deletion only via Next.js REST endpoints
- User must click a button in the UI to confirm
- Follows "humans approve, Claude proposes" pattern

### OAuth Reuse
- Reuses existing Google OAuth setup from Gmail integration
- Same scopes: `https://www.googleapis.com/auth/calendar`
- Bearer token passed via HTTP Authorization header

## Architecture

```
Browser (chat UI)
    ↓
Claude → MCP Tools (read-only)
    ↓
Google Calendar API
    ↓
Returns event data
    ↓
UI renders CalendarEventDraftCard
    ↓
User clicks "Create Event"
    ↓
REST API /api/google/calendar/create-event
    ↓
Calendar API (insert)
    ↓
Event created ✓
```

## Running the Server

### Development
```bash
npm install
npm run dev  # Type checking in watch mode
```

### Build
```bash
npm run build
npm start
```

### With systemd
```bash
systemctl start mcp-google-calendar
systemctl status mcp-google-calendar
journalctl -u mcp-google-calendar -f
```

## Tool Documentation

### list_calendars
Lists all calendars the user has access to.

```
Input: (none)
Output: Array of Calendar objects
```

### list_events
Lists events in a calendar within a date range.

```
Input:
  - calendarId: "primary" (default)
  - timeMin: "2024-02-13T00:00:00Z" (ISO 8601)
  - timeMax: "2024-02-14T00:00:00Z"
  - maxResults: 25 (1-250)
  - showDeleted: false

Output: Array of CalendarEvent objects
```

### get_event
Gets full details of a specific event.

```
Input:
  - calendarId: "primary"
  - eventId: "event123"

Output: CalendarEvent object with all details
```

### search_events
Searches events by text query.

```
Input:
  - query: "meeting with alice" (required)
  - calendarId: "primary"
  - timeMin, timeMax: optional date range
  - maxResults: 10

Output: Array of matching CalendarEvent objects
```

### check_availability
Checks free/busy availability for one or more calendars.

```
Input:
  - calendarIds: ["primary", "alice@example.com"] (required)
  - timeMin: "2024-02-13T08:00:00Z" (required, ISO 8601)
  - timeMax: "2024-02-13T17:00:00Z" (required)

Output: FreeBusy object with busy blocks for each calendar
```

### compose_calendar_event
Drafts an event for user review. Does NOT create the event.

```
Input:
  - summary: "Team Meeting" (required)
  - start: { dateTime: "2024-02-13T15:30:00", timeZone?: "America/New_York" } (required)
  - end: { dateTime: "2024-02-13T16:30:00", timeZone?: "America/New_York" } (required)
  - description?: "Discuss Q1 roadmap"
  - location?: "Conference Room A"
  - attendees?: [{ email: "alice@example.com", optional?: false }]
  - calendarId?: "primary"
  - transparency?: "opaque" (or "transparent" for free time)

Output: EventDraft object (JSON data for UI to render)
User must click "Create Event" button - Claude does NOT create it
```

### propose_meeting
Suggests a meeting with multiple time options.

```
Input:
  - title: "Project Planning" (required)
  - attendees: [{ email: "alice@example.com", displayName?: "Alice" }] (required)
  - suggestedTimes: [ (required)
      {
        start: "2024-02-13T14:00:00Z",
        end: "2024-02-13T15:00:00Z",
        reason: "Both attendees free, morning slot"
      }
    ]
  - description?: "Discuss Q1 planning"
  - location?: "Room 203"
  - conferenceType?: "googleMeet" (or "none")

Output: MeetingSuggestion object
User must click "Schedule" button to create the meeting
```

## Integration with Alive

### Provider Registry
Entry in `packages/shared/src/mcp-providers.ts`:

```typescript
google_calendar: {
  url: "http://localhost:8087/mcp",
  oauthKey: "google",  // Reuses Google OAuth
  friendlyName: "Google Calendar",
  defaultScopes: ["https://www.googleapis.com/auth/calendar"],
  knownTools: [
    "mcp__google_calendar__list_calendars",
    "mcp__google_calendar__list_events",
    // ... etc
  ]
}
```

### Component Registration
React components in `apps/web/lib/tools/register-tools.ts`:

```typescript
registerComponent(
  "mcp__google_calendar__compose_calendar_event",
  CalendarEventDraftOutput,
  validateEventDraft
)
```

### REST Endpoints
In `apps/web/app/api/google/calendar/`:
- `create-event/route.ts` - POST: Create event
- `update-event/route.ts` - PATCH: Update event
- `delete-event/route.ts` - DELETE: Delete event

## Authentication

### Bearer Token Flow
1. User authenticates with Google OAuth (in Alive UI)
2. Access token stored in Supabase
3. Claude SDK fetches token and passes to MCP server
4. MCP server receives: `Authorization: Bearer <access_token>`
5. Creates OAuth2 client with token
6. Makes Google Calendar API calls

### Scopes
Primary: `https://www.googleapis.com/auth/calendar`
Fallback: `https://www.googleapis.com/auth/calendar.readonly` (if user denies modify access)

## Error Handling

### Invalid Token
```
Error: No access token provided. Include Authorization: Bearer <token> header.
```

### API Errors
```
Error executing list_events: The user has not granted the required permissions.
```

### Validation Errors
```
Error executing compose_calendar_event: Start time must be after end time
```

## Testing

### Unit Tests
```bash
npm run test
npm run test:watch
```

### Manual Testing
```bash
# Check server health
curl http://localhost:8087/health

# Test with token
curl -X POST http://localhost:8087/mcp \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## Types

See `src/types.ts` for:
- `Calendar` - Calendar object
- `CalendarEvent` - Event with all details
- `EventDraft` - Event data for UI composition
- `FreeBusy` - Availability information
- `MeetingSuggestion` - Meeting proposal data
- Zod validation schemas for runtime validation

## Dependencies

- `@googleapis/calendar`: Google Calendar API client
- `@modelcontextprotocol/sdk`: MCP protocol implementation
- `express`: HTTP server
- `zod`: Schema validation
- `typescript`: Language

## Monitoring

### Logs
```bash
journalctl -u mcp-google-calendar -f
```

### Health Check
```bash
curl http://localhost:8087/health
# Returns: { "status": "ok", "server": "google-calendar" }
```

## Security Notes

- Bearer tokens are passed only over HTTPS in production
- MCP server validates all Zod schemas before Google API calls
- No event data is logged
- Disabled tools prevent autonomous event creation
- REST endpoints require session authentication

## Future Enhancements

- Recurring event pattern parsing
- Timezone-aware time slot suggestions
- Calendar color/styling support
- Event categories (work, personal, etc.)
- Smart scheduling assistant (find best time for group)
- Meeting prep assistance (pull attendee info, meeting notes)
