# Attachment Persistence Fix

## Problem
Attachments (images, files, templates, skills) attached to user messages were **disappearing from the chat after sending**. They were stored in memory while typing but lost during the database persistence layer.

### Root Cause
The message persistence layer (`messageAdapters.ts`) was not saving or restoring attachments:
- `toDbMessage()` - Created database records but dropped the `attachments` field
- `toUIMessage()` - Converted back to display format but couldn't restore attachments since they were never saved

## Solution
Added proper attachment serialization/deserialization across the persistence pipeline:

### 1. Database Schema Update (`messageDb.ts`)
Added `attachments?` field to `DbMessage`:
```typescript
export interface DbMessage {
  // ... existing fields ...
  attachments?: Record<string, unknown>[] // Serialized attachments array
}
```

### 2. Serialization Logic (`messageAdapters.ts`)
Added `serializeAttachments()` function that:
- Preserves essential fields per attachment kind (library-image, supertemplate, skill, uploaded-file, user-prompt)
- Drops transient fields (uploadProgress, error) that shouldn't be persisted
- Returns `undefined` for empty attachments (storage optimization)

### 3. Deserialization Logic (`messageAdapters.ts`)
Added `deserializeAttachments()` function that:
- Reconstructs attachments from stored format
- Casts back to `Attachment` type for React components
- Returns `undefined` if no attachments exist

### 4. Integration
Updated `toDbMessage()` and `toUIMessage()`:
- `toDbMessage()` now calls `serializeAttachments()` for user messages
- `toUIMessage()` now calls `deserializeAttachments()` to restore attachments

## Supported Attachment Types
- ✅ Library Images (photobookKey, preview, mode)
- ✅ SuperTemplates (templateId, name, preview)
- ✅ Skills (skillId, displayName, description, prompt, source)
- ✅ User Prompts (promptType, data, displayName)
- ✅ Uploaded Files (workspacePath, originalName, mimeType, size, preview)

## Testing
Added comprehensive tests in `lib/db/__tests__/messageAdapters-attachments.test.ts`:
- ✅ Persist library image attachments
- ✅ Persist uploaded file attachments
- ✅ Handle messages without attachments
- ✅ Drop transient fields (uploadProgress, error)

All tests pass, TypeScript strict mode passes, linting passes.

## User Experience Impact
- 🎉 Attached images/files now appear in chat history
- 🎉 Attachments survive page refresh/navigation
- 🎉 Conversation context preserved across sessions
- 🎉 No data loss on attachment metadata

## Files Changed
1. `apps/web/lib/db/messageDb.ts` - Added `attachments?` field
2. `apps/web/lib/db/messageAdapters.ts` - Added serialization/deserialization
3. `apps/web/lib/db/__tests__/messageAdapters-attachments.test.ts` - Test coverage

## Notes
- Transient fields (upload progress, errors) are intentionally not persisted - they're UI state only
- `preview` fields ARE persisted for rendering without re-fetching images
- Null/undefined attachment arrays are stored as `undefined` to save space
- All attachment kinds are handled uniformly via the discriminated union pattern
