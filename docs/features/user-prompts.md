# User Prompts Feature

**Status**: ✅ Implemented
**Version**: 2025-01-12

## Overview

User Prompts allow users to attach pre-configured, comprehensive prompt templates to their chat messages. The feature includes a dual-view system where users see short descriptions in the UI, but Claude receives full detailed prompts.

## Architecture

### Data Structure

**Location**: `lib/stores/userPromptsDefaults.ts`

```typescript
export const REVISE_PROMPT_DEFAULT = {
  data: "Full comprehensive prompt text...",
  userFacingDescription: "Short user-friendly description"
}
```

### Storage

**Store**: `lib/stores/userPromptsStore.ts`

```typescript
interface UserPrompt {
  id: string
  promptType: string // e.g., "revise-code", "organize-code"
  data: string // The actual prompt text (sent to Claude SDK)
  displayName: string // e.g., "Revise Code", "Organize Code"
  userFacingDescription?: string // Short description shown to user in UI
  createdAt: number
}
```

- **Persistence**: localStorage via Zustand persist middleware
- **SSR-safe**: Uses vanilla store pattern with Provider initialization

### Attachment Flow

1. **User Selection** → Toolbar menu (`ChatInput/Toolbar.tsx`)
2. **Attachment Creation** → `useAttachments.ts:addUserPrompt()`
3. **Display in Input** → `PromptBarAttachmentGrid.tsx` (shows displayName)
4. **Display in Message** → `ChatAttachments.tsx` (shows userFacingDescription)
5. **SDK Submission** → `prompt-builder.ts` (sends full `data` field)

## Key Components

### 1. Prompt Defaults (`userPromptsDefaults.ts`)

Exports pre-configured prompts with two views:

- `REVISE_PROMPT_DEFAULT`: Comprehensive code review checklist
- `ORGANIZE_PROMPT_DEFAULT`: Code organization review checklist

### 2. Store (`userPromptsStore.ts`)

Actions:
- `addPrompt(promptType, data, displayName, userFacingDescription?)`: Add custom prompt
- `updatePrompt(id, data, displayName, userFacingDescription?)`: Update existing prompt
- `removePrompt(id)`: Remove prompt
- `reset()`: Reset to defaults

### 3. UI Components

**Toolbar Menu** (`ChatInput/Toolbar.tsx`):
- Displays list of available prompts
- Shows `userFacingDescription` (or falls back to `data`) in dropdown

**Prompt Bar Attachment** (`PromptBarAttachmentGrid.tsx`):
- Shows attachment before sending
- Icon varies by `promptType` (ClipboardList for revise-code, Sparkles for others)

**Chat Attachments** (`ChatAttachments.tsx`):
- Renders prompt attachment in message
- Displays `userFacingDescription` instead of full prompt text
- Purple gradient styling to distinguish from other attachments

### 4. Prompt Builder (`utils/prompt-builder.ts`)

```typescript
export function buildPromptWithAttachments(message: string, attachments: Attachment[]): string {
  const userPrompts = attachments.filter(a => a.kind === "user-prompt")

  // Prepend user prompts at the very beginning
  if (userPrompts.length > 0) {
    const promptTexts = userPrompts.map(p => p.data).join("\n\n")
    prompt = message.trim() ? `${promptTexts}\n\n${prompt}` : promptTexts
  }

  // ... handle images and supertemplates
}
```

**Important**: Only the `data` field is sent to Claude SDK, not `userFacingDescription`.

## Default Prompts

### Revise Code

**Full Prompt**: Comprehensive checklist covering:
- Code Quality & Best Practices
- Potential Bugs & Edge Cases
- Security Vulnerabilities
- Performance Issues
- TypeScript/Type Safety
- React/Frontend Specific
- API/Backend Specific
- Testing & Reliability
- Dependencies & Imports
- Documentation & Comments

**User-Facing Description**: "Comprehensive code review covering quality, bugs, security, performance, TypeScript safety, React patterns, testing, and documentation."

### Organize Code

**Full Prompt**: Organization review covering:
- File Structure & Placement
- Lost & Orphaned Files
- Vite Workspace Specifics
- Import Organization
- Configuration Files
- Naming Conventions
- Code Grouping

**User-Facing Description**: "Review code organization including file structure, lost files, Vite workspace structure, imports, config files, naming conventions, and code grouping."

## User Experience

### Adding a Prompt

1. Click the ClipboardList icon in chat input toolbar
2. Select prompt from dropdown menu
3. Prompt appears as attachment with purple gradient styling
4. Send message - Claude receives full detailed prompt

### UI Display

**Toolbar Menu**:
```
📋 Revise Code
   Comprehensive code review covering quality, bugs, security...
```

**Attachment in Input Bar**:
```
[Icon] Revise Code
       User Prompt
```

**Attachment in Message**:
```
┌─────────────────────────────────────────┐
│ Revise Code                              │
│ Comprehensive code review covering       │
│ quality, bugs, security, performance...  │
└─────────────────────────────────────────┘
```

## Implementation Details

### Dual-View Pattern

The dual-view pattern separates concerns:

- **UI Layer** (`userFacingDescription`): Short, scannable descriptions for users
- **SDK Layer** (`data`): Full, detailed prompts for Claude

**Why?**
- Users don't want to see long prompt lists in UI
- Claude needs comprehensive context to perform thorough analysis
- Maintains clean UI while preserving prompt quality

### Type Safety

```typescript
// Attachment type
export interface UserPromptAttachment extends BaseAttachment {
  kind: "user-prompt"
  promptType: string
  data: string
  displayName: string
  userFacingDescription?: string
}

// Type guard
export function isUserPromptAttachment(attachment: Attachment): attachment is UserPromptAttachment {
  return attachment.kind === "user-prompt"
}
```

### Validation

**Duplicate Prevention**: `useAttachments.ts` checks if same `promptType` already attached

```typescript
if (attachments.some(a => isUserPromptAttachment(a) && a.promptType === promptType)) {
  config.onMessage?.(`"${displayName}" already attached`, "error")
  return
}
```

## Extension Points

### Adding New Default Prompts

1. Add prompt to `userPromptsDefaults.ts`:
```typescript
export const MY_PROMPT_DEFAULT = {
  data: "Full detailed prompt...",
  userFacingDescription: "Short description"
}
```

2. Add to default prompts in `userPromptsStore.ts`:
```typescript
{
  id: "default-my-prompt",
  promptType: "my-prompt",
  data: MY_PROMPT_DEFAULT.data,
  displayName: "My Prompt",
  userFacingDescription: MY_PROMPT_DEFAULT.userFacingDescription,
  createdAt: Date.now(),
}
```

### Custom User Prompts

Users can add custom prompts through store actions:

```typescript
const { actions } = useUserPromptsStore()
actions.addPrompt(
  "custom-review",
  "Full custom prompt text...",
  "Custom Review",
  "Optional short description"
)
```

## Testing

**Test Coverage**:
- ✅ `prompt-builder.test.ts`: Verifies `data` field sent to SDK
- ⚠️ Need UI component tests for dual-view rendering

## Future Enhancements

1. **Prompt Editor UI**: Allow users to edit prompts in settings
2. **Prompt Sharing**: Export/import prompt templates
3. **Prompt Variables**: Support placeholders like `{{fileName}}`
4. **Prompt Categories**: Organize prompts by category (code review, refactoring, etc.)
5. **Prompt Analytics**: Track which prompts are most effective

## Files Modified

- `lib/stores/userPromptsDefaults.ts` (created)
- `lib/stores/userPromptsStore.ts`
- `features/chat/components/ChatInput/types.ts`
- `features/chat/components/ChatInput/hooks/useAttachments.ts`
- `features/chat/components/ChatInput/Toolbar.tsx`
- `features/chat/components/ChatInput/PromptBarAttachmentGrid.tsx`
- `features/chat/components/message-renderers/ChatAttachments.tsx`

## Related Documentation

- [Message Handling](../architecture/message-handling.md) - Attachment system architecture
- [Prompt Builder](../../features/chat/utils/prompt-builder.ts) - How prompts are sent to SDK
- [User Prompts Store](../../lib/stores/userPromptsStore.ts) - Store implementation
