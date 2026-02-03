# Email Draft UI Component

**Status**: UI Component Complete (Fake Data)
**Feature Flag**: Superadmin Only
**Created**: 2026-01-24

## Overview

A UI component that displays email drafts in the chat interface. Claude can draft emails, but **only the user can click Send** - this is a critical safety constraint.

## Current State

The UI component is complete with fake data for testing. The Gmail API integration is not yet implemented.

### What's Working

- Email draft card with To/Cc/Bcc/Subject/Body display
- Status badges: Draft, Saved, Sending, Sent, Error
- Send button (simulated - 1.5s delay, then shows "Sent")
- Save Draft button (simulated - 0.8s delay, then shows "Saved")
- **Inline editing** - Click Edit to modify all fields directly in the card
- **Email chip input** - Add/remove recipients with Enter/comma, backspace to remove last
- **Gmail connection warning** - Shows banner when Gmail not connected with link to Settings
- Expand/collapse for long emails
- Dark mode support
- Tool result renderer registered for `gmail__compose_email`, `gmail__create_draft`, `gmail__reply_email`

### How to Test

**Option 1: Preview UI Page (Recommended)**
1. Log in as superadmin (a superadmin user)
2. Navigate to `/preview-ui`
3. A Storybook-like component previewer shows the EmailDraftCard
4. Test all states: Draft, Saved, Sending, Sent, Error
5. Controls available:
   - **Reset All** - Reset all drafts to initial state
   - **New Draft** - Add a blank draft to test inline editing
   - **Add Error State** - Add a draft in error state
   - **Gmail toggle** - Simulate connected/disconnected state to test warning banner
6. Click **Edit** on any draft to test inline editing:
   - Add/remove recipients with Enter or comma
   - Edit subject and body directly
   - Click Done to save or Cancel to discard

**Option 2: Settings Toggle**
1. Log in as superadmin (a superadmin user)
2. Go to **Settings > Admin**
3. Toggle **"Email Draft Preview"**
4. Two fake email drafts appear with working buttons

## Files Created

| File | Purpose |
|------|---------|
| `apps/web/components/email/types.ts` | EmailDraft interface, fake data |
| `apps/web/components/email/EmailDraftCard.tsx` | Main card component |
| `apps/web/components/email/index.ts` | Barrel export |
| `apps/web/components/ui/chat/tools/email/EmailDraftOutput.tsx` | Tool result renderer |
| `apps/web/hooks/use-superadmin.ts` | Client-side superadmin check |
| `apps/web/app/api/auth/me/route.ts` | Returns user info including isSuperadmin |
| `apps/web/app/preview-ui/page.tsx` | Storybook-like component previewer (superadmin only) |
| `packages/tools/src/tool-names.ts` | Added EMAIL constants |

## Files Modified

| File | Change |
|------|--------|
| `packages/tools/src/index.ts` | Export EMAIL constants |
| `apps/web/lib/tools/register-tools.ts` | Register email components |
| `apps/web/components/settings/tabs/AdminSettings.tsx` | Added Email Draft Preview section |

## Next Steps (Gmail Integration)

1. **Gmail API Service** - Create service using existing Google OAuth tokens from `@webalive/oauth-core`
2. **Send Email** - Implement `handleSend` to call Gmail API `messages.send`
3. **Save Draft** - Implement `handleSaveDraft` to call Gmail API `drafts.create`
4. ~~**Edit Modal** - Add inline editing or modal for modifying drafts~~ **DONE** - Inline editing implemented
5. **Thread Support** - Handle replies with `threadId`

## Architecture Notes

### Tool Names
```typescript
export const EMAIL = {
  COMPOSE: "gmail__compose_email",
  CREATE_DRAFT: "gmail__create_draft",
  SEND: "gmail__send_email",
  REPLY: "gmail__reply_email",
} as const
```

### EmailDraft Interface
```typescript
interface EmailDraft {
  id?: string              // Gmail draft ID if saved
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  body: string
  threadId?: string        // For replies
  status: "draft" | "saved" | "sending" | "sent" | "error"
  error?: string
  createdAt?: string
}
```

### Security Model

- Claude drafts emails via tool calls
- Tool result renders EmailDraftCard
- **Only user clicks trigger Send/Save** - Claude cannot programmatically send
- Gmail API calls will use OAuth tokens stored via `@webalive/oauth-core`

## Related Files

- `packages/oauth-core/src/providers/google.ts` - Google OAuth provider (already exists)
- `packages/shared/src/mcp-providers.ts` - OAUTH_ONLY_PROVIDERS includes "google"
