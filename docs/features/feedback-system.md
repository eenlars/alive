# Feedback System Implementation

This document describes the feedback storage system implementation for Alive.

## Overview

A simple, file-based feedback storage system that follows the same pattern as `domain-passwords.json`. Feedback is stored in a JSON file and automatically includes the workspace ID (domain) of the user submitting feedback.

## Storage

### File Location

Following the same pattern as domain passwords:

1. **Production**: Path derived from `SERVER_CONFIG_PATH` env var (e.g., `feedback.json` in the same directory as `server-config.json`)
2. **Development Fallbacks**:
   - `{cwd}/feedback.json` (current working directory)
   - `/root/alive/feedback.json`

The system automatically creates the file and directories if they don't exist.

### File Format

```json
{
  "entries": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "workspace": "example.com",
      "feedback": "The UI is very intuitive!",
      "timestamp": "2025-01-08T12:34:56.789Z",
      "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...",
      "conversationId": "uuid-v4-optional"
    }
  ]
}
```

### Fields

- **`id`** (string, UUID): Auto-generated unique identifier
- **`workspace`** (string): Domain/workspace of the user (e.g., "example.com")
- **`feedback`** (string, 1-5000 chars): User's feedback text
- **`timestamp`** (string, ISO 8601): Auto-generated submission time
- **`userAgent`** (string, optional): Browser user agent string
- **`conversationId`** (string, UUID, optional): Associated conversation ID

## Implementation Files

### Backend

1. **`apps/web/types/feedback.ts`**
   - TypeScript types for `FeedbackEntry` and `FeedbackStore`

2. **`apps/web/lib/feedback.ts`**
   - `loadFeedback()`: Load all feedback from file
   - `saveFeedback(store)`: Save feedback to file
   - `addFeedbackEntry(entry)`: Add new feedback entry
   - `getAllFeedback()`: Get all feedback entries
   - `getFeedbackByWorkspace(workspace)`: Filter by workspace

3. **`apps/web/app/api/feedback/route.ts`**
   - `POST /api/feedback`: Submit feedback (no auth required)
   - `OPTIONS /api/feedback`: CORS preflight

### Frontend

1. **`apps/web/components/modals/FeedbackModal.tsx`**
   - Updated to submit feedback via API
   - Accepts `workspace` and `conversationId` props
   - Shows success/error states

2. **`apps/web/app/chat/page.tsx`**
   - Enabled feedback button (removed disabled state)
   - Passes workspace and conversationId to modal

3. **`apps/web/app/manager/page.tsx`**
   - Added "Feedback" tab to manager interface
   - Displays all feedback entries from all workspaces
   - Shows workspace, timestamp, user agent, and conversation ID
   - Refresh button to reload feedback
   - Badge showing feedback count

## Manager Interface

The manager page (`/manager`) includes a **Feedback** tab that displays all feedback submissions from all workspaces.

**Features:**
- View all feedback sorted by newest first
- Shows workspace, timestamp, feedback text, and optional conversation ID
- Displays user agent information
- Badge showing total feedback count
- Refresh button to reload feedback
- Requires manager authentication

**Access:** Navigate to `/manager` → Feedback tab

## API Endpoints

### GET /api/manager/feedback

Fetch all feedback entries (requires manager authentication).

**Authentication:** Manager session cookie required

**Response (Success):**
```json
{
  "ok": true,
  "feedback": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "workspace": "example.com",
      "feedback": "Great platform!",
      "timestamp": "2025-01-08T12:34:56.789Z",
      "userAgent": "Mozilla/5.0...",
      "conversationId": "uuid-optional"
    }
  ],
  "count": 1
}
```

**Response (Unauthorized):**
```json
{
  "ok": false,
  "error": "WORKSPACE_NOT_AUTHENTICATED",
  "message": "Not authenticated"
}
```

### POST /api/feedback

Submit user feedback.

**Request:**
```json
{
  "feedback": "Great platform!",
  "workspace": "example.com",
  "conversationId": "uuid-v4-optional",
  "userAgent": "Mozilla/5.0..."
}
```

**Response (Success):**
```json
{
  "ok": true,
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-01-08T12:34:56.789Z"
}
```

**Response (Error):**
```json
{
  "ok": false,
  "error": "INVALID_REQUEST",
  "message": "Invalid request body",
  "details": { ... },
  "requestId": "..."
}
```

## Security

- **No authentication required**: Feedback is intentionally open to simplify submission
- **Rate limiting**: Not implemented (consider adding in production)
- **Input validation**: Feedback limited to 5000 characters via Zod schema
- **XSS protection**: Standard Next.js escaping applies
- **File permissions**: Follow same security model as domain-passwords.json

## Testing

**Unit tests**: `apps/web/lib/__tests__/feedback.test.ts`

Run tests:
```bash
cd apps/web && bun run test lib/__tests__/feedback.test.ts
```

Tests cover:
- Creating empty feedback store
- Adding feedback entries
- Auto-generating IDs and timestamps
- Saving and retrieving feedback
- Filtering by workspace
- Optional fields (conversationId, userAgent)

## Git

The `feedback.json` file is gitignored (added to `.gitignore`).

## Future Enhancements

1. ~~**Admin interface**: Add to `/manager` page to view all feedback~~ ✅ **COMPLETED**
2. **Email notifications**: Alert on new feedback submissions
3. **Rate limiting**: Prevent spam/abuse
4. **Rich metadata**: Track browser, OS, screen size, etc.
5. **Sentiment analysis**: Categorize feedback automatically
6. **Database migration**: Move from JSON file to database for better scalability
7. **Search/filter**: Advanced filtering in admin UI
8. **Export**: CSV/JSON export for analysis

## Usage Example

### Submit Feedback (Frontend)

```typescript
const response = await fetch("/api/feedback", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    feedback: "Love the new features!",
    workspace: "example.com",
    conversationId: "uuid-here",
    userAgent: navigator.userAgent,
  }),
})

const result = await response.json()
console.log(result.id) // UUID of feedback entry
```

### Read Feedback (Backend)

```typescript
import { getAllFeedback, getFeedbackByWorkspace } from "@/lib/feedback"

// Get all feedback
const allFeedback = getAllFeedback()

// Get feedback for specific domain
const exampleFeedback = getFeedbackByWorkspace("example.com")
```

## Notes

- **Workspace tracking**: The workspace (domain) is automatically included in the background when users submit feedback, allowing you to identify which site the feedback is from
- **Conversation context**: If submitted during a chat session, the conversationId is included for tracing
- **User agent**: Automatically captured to understand browser/device distribution
- **Timestamp**: All entries are timestamped in ISO 8601 format (UTC)
