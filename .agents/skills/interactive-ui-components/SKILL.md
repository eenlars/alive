---
name: Interactive UI Components Guide
description: Step-by-step guide to add a new interactive UI component for chat tools. Includes best practices from MCP Apps, form UX research, and real examples like WebsiteConfig.
---

# Interactive UI Components Guide

You are an expert guide for creating interactive UI components that render in the chat as tool outputs. These components allow Claude to collect structured input from users through forms, wizards, and interactive elements.

## Overview

Interactive UI components follow a specific pattern:
1. **Tool definition** returns structured data (not rendered directly)
2. **Output component** parses tool output and renders the UI
3. **Main component** handles user interaction and state
4. **onSubmitAnswer callback** sends user's choices back to Claude

## File Checklist

| # | File | Action | Required |
|---|------|--------|----------|
| 1 | `apps/web/components/ai/[ComponentName].tsx` | Main UI component | Yes |
| 2 | `apps/web/components/ui/chat/tools/ai/[ComponentName]Output.tsx` | Output wrapper | Yes |
| 3 | `packages/tools/src/tools/ai/[tool-name].ts` | Tool definition | Yes |
| 4 | `packages/tools/src/tool-names.ts` | Add constant | Yes |
| 5 | `packages/tools/src/display-config.ts` | Configure auto-expand | Yes |
| 6 | `apps/web/lib/tools/register-tools.ts` | Register component | Yes |
| 7 | `packages/tools/src/mcp-server.ts` | Add to MCP server | Yes |
| 8 | `packages/tools/src/tools/meta/tool-registry.ts` | Add metadata | Yes |

## Step-by-Step Implementation

### Step 1: Create the Main UI Component

**File:** `apps/web/components/ai/[ComponentName].tsx`

This is the actual interactive component users see and interact with.

```typescript
/**
 * [Component Name]
 *
 * [Brief description of what this component does]
 */

"use client"

import { useState, useCallback } from "react"

// Types for the data this component receives
export interface [ComponentName]Data {
  // Fields passed from the tool
  options: Array<{ id: string; label: string }>
  defaultValue?: string
  context?: string
}

// Result type when user completes
export interface [ComponentName]Result {
  selectedId: string
  // Other fields the user provides
}

interface [ComponentName]Props {
  data: [ComponentName]Data
  onComplete: (result: [ComponentName]Result) => void
  onSkip?: () => void
}

export function [ComponentName]({ data, onComplete, onSkip }: [ComponentName]Props) {
  const [selected, setSelected] = useState<string | null>(data.defaultValue || null)

  const handleSubmit = useCallback(() => {
    if (!selected) return
    onComplete({ selectedId: selected })
  }, [selected, onComplete])

  return (
    <div className="rounded-xl border border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] p-4">
      {/* Component UI here */}
      <div className="flex gap-2 mt-4">
        {onSkip && (
          <button
            onClick={onSkip}
            className="px-4 py-2 text-sm text-black/50 dark:text-white/50 hover:text-black/70 dark:hover:text-white/70 transition-colors"
          >
            Skip
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={!selected}
          className="px-4 py-2 text-sm bg-black dark:bg-white text-white dark:text-black rounded-lg disabled:opacity-30 hover:brightness-[0.85] transition-all"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
```

### Step 2: Create the Output Wrapper

**File:** `apps/web/components/ui/chat/tools/ai/[ComponentName]Output.tsx`

This wraps the component and handles the tool output → component data transformation.

```typescript
/**
 * [Component Name] Output
 *
 * Renders the [tool_name] tool result as an interactive component.
 * When the user submits, their response is sent back to Claude.
 */

"use client"

import { useState, useCallback } from "react"
import { [ComponentName], type [ComponentName]Data, type [ComponentName]Result } from "@/components/ai/[ComponentName]"
import type { ToolResultRendererProps } from "@/lib/tools/tool-registry"

/**
 * Expected data format from the tool
 */
interface [ComponentName]ToolData {
  type: "[component_type]"
  // Mirror the tool output structure
  options: Array<{ id: string; label: string }>
  defaultValue?: string
  context?: string
}

/**
 * Type guard to validate the tool output
 */
export function validate[ComponentName](data: unknown): data is [ComponentName]ToolData {
  if (!data || typeof data !== "object") return false
  const d = data as Record<string, unknown>

  if (d.type !== "[component_type]") return false
  if (!Array.isArray(d.options)) return false

  return true
}

/**
 * Format the result for submission to Claude
 */
function formatResultForSubmission(result: [ComponentName]Result): string {
  return `I selected: ${result.selectedId}`
}

interface [ComponentName]OutputProps extends ToolResultRendererProps<[ComponentName]ToolData> {
  onSubmitAnswer?: (message: string) => void
}

export function [ComponentName]Output({ data, onSubmitAnswer }: [ComponentName]OutputProps) {
  const [submitted, setSubmitted] = useState(false)
  const [skipped, setSkipped] = useState(false)

  const componentData: [ComponentName]Data = {
    options: data.options,
    defaultValue: data.defaultValue,
    context: data.context,
  }

  const handleComplete = useCallback(
    (result: [ComponentName]Result) => {
      setSubmitted(true)
      const message = formatResultForSubmission(result)
      onSubmitAnswer?.(message)
    },
    [onSubmitAnswer],
  )

  const handleSkip = useCallback(() => {
    setSkipped(true)
    onSubmitAnswer?.("I'd like to skip this for now.")
  }, [onSubmitAnswer])

  // Show completion state
  if (submitted || skipped) {
    return (
      <div className="mt-2 p-3 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5">
        <p className="text-xs text-black/50 dark:text-white/50">
          {skipped ? "Skipped" : "Response submitted"}
        </p>
      </div>
    )
  }

  return (
    <div className="mt-2">
      <[ComponentName] data={componentData} onComplete={handleComplete} onSkip={handleSkip} />
    </div>
  )
}
```

### Step 3: Create the Tool Definition

**File:** `packages/tools/src/tools/ai/[tool-name].ts`

```typescript
/**
 * [Tool Name] Tool
 *
 * [Description of when Claude should use this tool]
 */

import { z } from "zod"
import { tool, type ToolDefinition } from "@anthropic-ai/claude-agent-sdk"

// Schema as raw shape (NOT wrapped in z.object)
export const [toolName]ParamsSchema = {
  context: z.string().optional().describe("Optional context about why this is being shown"),
  defaultValue: z.string().optional().describe("Optional default selection"),
}

// Available options (could come from config or be hardcoded)
const DEFAULT_OPTIONS = [
  { id: "option1", label: "Option 1", description: "Description of option 1" },
  { id: "option2", label: "Option 2", description: "Description of option 2" },
]

export async function [toolName](args: z.infer<z.ZodObject<typeof [toolName]ParamsSchema>>) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          type: "[component_type]",
          options: DEFAULT_OPTIONS,
          defaultValue: args.defaultValue,
          context: args.context,
        }),
      },
    ],
    isError: false,
  }
}

export const [toolName]Tool: ToolDefinition = tool(
  "[tool_name]",
  `Show an interactive component for [purpose].

Use this tool when:
- [Scenario 1 when Claude should use this]
- [Scenario 2 when Claude should use this]
- The user says something like "[example phrase]"

The component will render in the chat and collect user input.
After the user submits, their response will be sent back as a message.`,
  [toolName]ParamsSchema,
  async (args) => [toolName](args),
)
```

### Step 4: Add Tool Name Constant

**File:** `packages/tools/src/tool-names.ts`

```typescript
export const TOOL_NAMES = {
  // ... existing tools
  [TOOL_NAME]: "[tool_name]",
} as const
```

### Step 5: Configure Display

**File:** `packages/tools/src/display-config.ts`

```typescript
export const TOOL_DISPLAY_CONFIG: Record<string, ToolDisplayConfig> = {
  // ... existing configs
  [[TOOL_NAME]]: {
    autoExpand: true,  // Always show content, don't collapse
  },
}
```

### Step 6: Register Component Renderer

**File:** `apps/web/lib/tools/register-tools.ts`

```typescript
import { [ComponentName]Output, validate[ComponentName] } from "@/components/ui/chat/tools/ai/[ComponentName]Output"
import { TOOL_NAMES } from "@webalive/tools"

export function registerToolRenderers(registry: ToolRegistry) {
  // ... existing registrations

  registry.register({
    name: `mcp__alive-tools__${TOOL_NAMES.[TOOL_NAME]}`,
    outputRenderer: [ComponentName]Output,
    validateData: validate[ComponentName],
  })
}
```

### Step 7: Add to MCP Server

**File:** `packages/tools/src/mcp-server.ts`

```typescript
import { [toolName]Tool } from "./tools/ai/[tool-name].js"

export const toolsInternalMcp = createSdkMcpServer({
  name: "alive-tools",
  version: "1.0.0",
  tools: [
    // ... existing tools
    [toolName]Tool,
  ],
})
```

### Step 8: Add to Tool Registry

**File:** `packages/tools/src/tools/meta/tool-registry.ts`

```typescript
const INTERNAL_TOOL_REGISTRY: ToolMetadata[] = [
  // ... existing tools
  {
    name: "[tool_name]",
    category: "meta",
    description: "Show an interactive [component type] for [purpose].",
    contextCost: "low",
    enabled: true,
    parameters: [
      {
        name: "context",
        type: "string",
        required: false,
        description: "Optional context about why this is being shown",
      },
    ],
  },
]
```

## Best Practices

### From MCP Apps Specification

1. **Return structured data, not rendered UI** - The tool returns JSON that the client renders
2. **Include type discriminator** - Add a `type` field for validation (e.g., `type: "website_config"`)
3. **Validate tool output** - Create a type guard function (`validateComponentName`)
4. **Handle skip/cancel** - Allow users to dismiss without completing

### Form UX Best Practices

1. **Validate on blur, not keystroke** - Reduces noise and distraction
2. **Show errors inline with context** - Place error messages near the relevant field
3. **Use ARIA attributes** - `aria-invalid`, `aria-describedby` for accessibility
4. **Progress indicators** - Show step completion in multi-step flows
5. **Visual feedback** - Border color changes for valid/invalid states
6. **Double-click shortcuts** - Allow power users to advance faster (e.g., double-click to select and continue)

### Multi-Step Wizard Pattern

```typescript
const [step, setStep] = useState<"step1" | "step2" | "confirm">("step1")

// Show progress indicator
const steps = ["step1", "step2", "confirm"]
const currentIndex = steps.indexOf(step)
const completedSteps = steps.slice(0, currentIndex)

// In header:
<div className="flex gap-2 mb-4">
  {steps.map((s, i) => (
    <div
      key={s}
      className={cn(
        "flex-1 h-1 rounded-full transition-colors",
        i <= currentIndex ? "bg-black/60" : "bg-black/10"
      )}
    />
  ))}
</div>
```

### Styling Patterns

Follow the `ui-polish` skill for styling. Key patterns:

```typescript
// Container
className="rounded-xl border border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] p-4"

// Input with validation
className={cn(
  "w-full px-3 py-2 rounded-lg border transition-colors",
  "bg-white dark:bg-white/5 text-black dark:text-white",
  hasError
    ? "border-red-500/50 focus:border-red-500"
    : isValid
      ? "border-green-500/30"
      : "border-black/10 dark:border-white/10 focus:border-black/30"
)}

// Primary button
className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg disabled:opacity-30 hover:brightness-[0.85] transition-all"

// Secondary/skip button
className="px-4 py-2 text-sm text-black/50 dark:text-white/50 hover:text-black/70 dark:hover:text-white/70 transition-colors"
```

### Error Messages

```typescript
// Inline error with ARIA
{error && (
  <p
    id={`${fieldId}-error`}
    className="text-xs text-red-500 mt-1"
    role="alert"
  >
    {error}
  </p>
)}

// On the input
<input
  aria-invalid={!!error}
  aria-describedby={error ? `${fieldId}-error` : undefined}
  ...
/>
```

## Reference Implementation

**WebsiteConfig** is a complete example:

| File | Purpose |
|------|---------|
| `apps/web/components/ai/WebsiteConfig.tsx` | Multi-step wizard (slug → template → ideas → confirm) |
| `apps/web/components/ui/chat/tools/ai/WebsiteConfigOutput.tsx` | Output wrapper with validation |
| `packages/tools/src/tools/ai/ask-website-config.ts` | Tool definition |

## Testing

1. **Preview page** - Create at `apps/web/app/ui/previews/[ComponentName]Preview.tsx`:
```typescript
"use client"

import { [ComponentName] } from "@/components/ai/[ComponentName]"

export default function [ComponentName]Preview() {
  return (
    <div className="p-8 max-w-md mx-auto">
      <[ComponentName]
        data={{
          options: [{ id: "test", label: "Test Option" }],
        }}
        onComplete={(result) => console.log("Complete:", result)}
        onSkip={() => console.log("Skipped")}
      />
    </div>
  )
}
```

2. **Add to UI library** at `apps/web/app/ui/page.tsx`

3. **Test in chat** - Ask Claude to use the tool and verify:
   - Component renders correctly
   - Validation works on blur
   - Submit sends message back
   - Skip works if enabled

## Common Pitfalls

1. **Missing type discriminator** - Always include `type: "[component_type]"` in tool output
2. **Wrapping schema in z.object** - Schema must be raw shape, SDK wraps it
3. **Forgetting display config** - Without `autoExpand: true`, content may be hidden
4. **Missing onSubmitAnswer** - The output wrapper MUST call this to send response
5. **Not handling loading states** - Add submitted/skipped state tracking

## Verification Checklist

- [ ] Component renders in isolation (preview page)
- [ ] Tool returns correct JSON structure with type field
- [ ] Validation function correctly identifies valid/invalid data
- [ ] onComplete sends properly formatted message
- [ ] onSkip sends skip message
- [ ] Submitted state shows confirmation
- [ ] Keyboard navigation works (Tab, Enter)
- [ ] Error states have ARIA attributes
- [ ] Dark mode works
- [ ] TypeScript compiles: `bun run type-check`
- [ ] Build succeeds: `bun run build`
