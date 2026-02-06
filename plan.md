# Plan: @Skill Mention Autocomplete in Chat Input

## Summary

When users type `@` in the chat textarea (at the start or after a space), a filtered dropdown of skills appears. Typing letters/hyphens after `@` filters the list. Selecting a skill removes the `@query` text and attaches it as a SkillAttachment (same as clicking from the toolbar menu). This gets special visual treatment -- it's the premium interaction.

## Changes

### 1. Add `onAddSkill` to ChatInputContextValue (`types.ts`)

Add one optional field so InputArea can access the skill-adding function through context:

```typescript
export interface ChatInputContextValue extends ChatInputState, ChatInputActions {
  config: ChatInputConfig
  registerTextareaRef: (ref: HTMLTextAreaElement | null) => void
  onAddSkill?: (skillId: string, displayName: string, description: string, prompt: string, source: "global" | "user" | "project") => void
}
```

### 2. Thread `addSkill` into context (`ChatInput.tsx`)

Add `onAddSkill: addSkill` to the `contextValue` object (line ~163) and its dependency array. `addSkill` is already available from `useAttachments`.

### 3. Create `hooks/useSkillMention.ts` (new file)

Custom hook encapsulating all mention logic:

- **Trigger detection**: Walk backwards from cursor to find `@`. Only valid if at position 0 or preceded by space/newline.
- **Query validation**: Only `[a-zA-Z-]` characters allowed between `@` and cursor. Anything else closes the popup.
- **Filtering**: Case-insensitive match on `displayName` and `id`.
- **Keyboard**: ArrowUp/Down to navigate, Enter/Tab to select, Escape to close.
- **Selection**: Remove `@query` from message text, call `onAddSkill`, refocus textarea.
- **State**: `isOpen`, `query`, `filteredSkills`, `selectedIndex`.

### 4. Create `SkillMentionPopup.tsx` (new file)

The popup component. Positioned `absolute bottom-full left-0 right-0` above the InputContainer. Renders inside the `<div className="relative">` that wraps `<InputContainer>` in `ChatInput.tsx`.

Visual design (special/premium feel):
- Full width of input container (not a narrow menu)
- Rounded-2xl with shadow-xl, matching existing popup pattern
- "Skills" header label in small uppercase
- Each skill row: purple icon + displayName (with match highlighting) + description
- Selected item has subtle background highlight
- Smooth `animate-in fade-in slide-in-from-bottom-2` entrance
- `HighlightMatch` component bolds the matched portion in purple
- Max height 64 with scroll, empty state for no matches
- Full ARIA combobox/listbox pattern for accessibility

### 5. Integrate into `InputArea.tsx`

- Import `useSkillMention` and `SkillMentionPopup`
- Call the hook with `message`, `setMessage`, `onAddSkill`, `textareaRef`
- On `onChange`: also call `mention.handleChange(newValue, textarea)`
- On `onKeyDown`: when popup is open, let mention handler take priority
- Render `SkillMentionPopup` when `mention.isOpen` is true

**Positioning**: The popup renders as a portal-like absolute element. Since `InputContainer` already has `className="relative"`, and `ChatInput.tsx` wraps it in another `<div className="relative">`, the popup at `bottom-full` will appear above the entire input container. We render the popup from within InputArea but position it relative to the outer container by placing it at the `ChatInput.tsx` level instead (cleaner).

Actually, looking at the structure more carefully: the popup should render **outside** InputContainer but inside the `<div className="relative">` wrapper in ChatInput.tsx. This way `absolute bottom-full` positions it above the rounded border. We'll do this by having `useSkillMention` expose its state, and rendering `SkillMentionPopup` in `ChatInput.tsx` right above `<InputContainer>`.

### File Summary

| File | Action |
|------|--------|
| `types.ts` | Add `onAddSkill` to `ChatInputContextValue` |
| `ChatInput.tsx` | Thread `addSkill` into context + render `SkillMentionPopup` |
| `hooks/useSkillMention.ts` | New: mention detection, filtering, keyboard, selection |
| `SkillMentionPopup.tsx` | New: premium popup UI component |
| `InputArea.tsx` | Wire hook into onChange/onKeyDown, expose mention state up |

### Keyboard Behavior

| Key | Action |
|-----|--------|
| `ArrowDown` | Next item (wraps) |
| `ArrowUp` | Previous item (wraps) |
| `Enter` | Select highlighted skill |
| `Tab` | Select highlighted skill |
| `Escape` | Close popup |
| Any invalid char | Close popup (handled by change detection) |
