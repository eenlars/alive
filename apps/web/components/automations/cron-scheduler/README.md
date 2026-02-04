# Cron Scheduler Component

A comprehensive UI component system for editing and understanding cron expressions. Designed for the Automations settings with support for both preset schedules and custom cron expressions.

## Directory Structure

```
cron-scheduler/
├── index.ts                    # Main exports
├── types.ts                    # TypeScript types and interfaces
├── cron-parser.ts             # Cron expression parsing and description
├── cron-presets.ts            # Preset cron expressions and matching logic
├── CronScheduler.tsx          # Main container component
├── CronPresetsPanel.tsx       # Preset selection UI
├── CronExpressionInput.tsx    # Custom cron expression input with validation
└── README.md                   # This file
```

## Components

### CronScheduler (Main)

The main container component that handles the complete cron scheduling UI.

**Props:**
- `value: string` - Current cron expression
- `onChange: (cron: string) => void` - Called when cron expression changes
- `showOneTime?: boolean` - Show toggle for one-time vs recurring (default: false)
- `onOneTimeChange?: (isOneTime: boolean) => void` - Called when one-time mode changes
- `oneTimeDate?: string` - Current one-time date (YYYY-MM-DD format)
- `oneTimeTime?: string` - Current one-time time (HH:MM format)
- `onOneTimeDateChange?: (date: string) => void` - Called when one-time date changes
- `onOneTimeTimeChange?: (time: string) => void` - Called when one-time time changes

**Features:**
- Toggle between one-time and recurring modes
- Tab-based interface for Presets vs Custom
- Live cron expression description
- Validation feedback for custom expressions
- Responsive design

### CronPresetsPanel

Panel for selecting from common preset schedules.

**Props:**
- `selectedValue: string` - Currently selected cron expression
- `onSelect: (value: string) => void` - Called when a preset is selected
- `showDescription?: boolean` - Show descriptions (default: true)

**Presets Included:**
- Every 5 minutes
- Every 10 minutes
- Hourly
- Daily (9:00 AM)
- Weekdays (9:00 AM)
- Mondays (9:00 AM)
- Weekly (Sundays 9:00 AM)
- Monthly (1st day 9:00 AM)
- Every 6 hours
- Twice daily (9:00 AM and 6:00 PM)

### CronExpressionInput

Input field with validation for custom cron expressions.

**Props:**
- `value: string` - Current cron expression
- `onChange: (value: string) => void` - Called when expression changes
- `showValidation?: boolean` - Show validation feedback (default: true)

**Features:**
- Real-time validation
- Human-readable error messages
- Shows matching preset if applicable
- Monospace font for expression clarity

## Utilities

### cron-parser.ts

Parses cron expressions and generates human-readable descriptions.

**Functions:**

#### `parseCronExpression(expression: string): CronParts | null`
Parses a 5-field cron expression into its components.

#### `describeCron(expression: string): string`
Generates a natural language description of a cron expression.

**Examples:**
```typescript
describeCron("*/5 * * * *") // "Every 5 minutes"
describeCron("0 9 * * 1-5") // "at 09:00 on Monday, Tuesday, Wednesday, Thursday, Friday"
describeCron("0 9 1 * *")   // "at 09:00 on day 1"
```

### cron-presets.ts

Manages preset cron expressions.

**Exports:**
- `CRON_PRESETS: CronPreset[]` - Array of available presets
- `matchPreset(expression: string): CronPreset | null` - Find preset matching an expression

## Usage Example

```tsx
import { CronScheduler } from "@/components/automations/cron-scheduler"
import { useState } from "react"

export function MyComponent() {
  const [cron, setCron] = useState("0 9 * * 1-5")
  const [isOneTime, setIsOneTime] = useState(false)
  const [date, setDate] = useState("2025-02-05")
  const [time, setTime] = useState("14:30")

  return (
    <div className="rounded-xl border overflow-hidden">
      <CronScheduler
        value={cron}
        onChange={setCron}
        showOneTime={true}
        onOneTimeChange={setIsOneTime}
        oneTimeDate={date}
        oneTimeTime={time}
        onOneTimeDateChange={setDate}
        onOneTimeTimeChange={setTime}
      />
    </div>
  )
}
```

## Cron Expression Format

Standard 5-field cron expression:
```
minute hour day month weekday
```

**Fields:**
- `minute`: 0-59
- `hour`: 0-23 (UTC by default, timezone can be applied separately)
- `day`: 1-31 (day of month)
- `month`: 1-12
- `weekday`: 0-7 (0 and 7 = Sunday)

**Special characters:**
- `*` - Any value
- `,` - Multiple values (e.g., `1,3,5`)
- `-` - Range (e.g., `1-5`)
- `/` - Step values (e.g., `*/5`)

**Examples:**
- `0 9 * * 1-5` - Weekdays at 9:00 AM
- `*/5 * * * *` - Every 5 minutes
- `0 0 1 * *` - Monthly at midnight on the 1st
- `30 2 * * 0` - Weekly at 2:30 AM on Sundays

## Design Notes

- Component uses system design tokens (semantic colors)
- Responsive layout works on mobile and desktop
- Validation provides clear feedback on invalid expressions
- Preset matching helps users understand their custom expressions
- Live description updates as user types
- One-time mode provides separate date/time inputs

## Accessibility

- All interactive elements have proper `type="button"` attributes
- Labels clearly identify input fields
- Error states use color + icon for clarity
- Tab navigation works through all controls
- Keyboard shortcuts: Tab to navigate, Space/Enter to select
