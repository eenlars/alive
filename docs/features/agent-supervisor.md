# Agent Supervisor: Auto-Evaluate & Guide Next Action

## Overview

When Claude completes a response, automatically analyze the conversation progress and suggest the best next action to reach the PR goal. Uses Claude Code SDK (`askAIFull`) for deep analysis and Groq for fast formatting.

## Problem

Agents often:
- Get stuck in loops
- Make mistakes that compound
- Lose track of the larger goal
- Need guidance to course-correct

## Solution

Insert a "supervisor" step after each Claude completion that:
1. Analyzes the full conversation against the PR goal
2. Determines if we're on track or stuck
3. Suggests the optimal next action
4. Formats it as a ready-to-send message

## Flow

```
bridge_complete event
       ↓
formatMessagesAsText(messages)
       ↓
┌─────────────────────────────────────────────────────┐
│  askAIFull (Claude Code SDK)                        │
│                                                     │
│  Has full workspace access, can:                    │
│  - Read files to understand current state           │
│  - Check what was actually changed                  │
│  - Verify if changes match the goal                 │
│                                                     │
│  Prompt:                                            │
│  - Here's the conversation so far                   │
│  - Here's the PR goal                               │
│  - Are we on track? What went wrong?                │
│  - What's the BEST NEXT ACTION?                     │
│                                                     │
│  Output: Long analysis (can be 1000+ tokens)        │
└─────────────────────────────────────────────────────┘
       ↓
┌─────────────────────────────────────────────────────┐
│  Groq (fast, cheap LLM)                             │
│                                                     │
│  Prompt:                                            │
│  - Given this analysis                              │
│  - Output ONLY the next user message                │
│  - Make it actionable and specific                  │
│                                                     │
│  Output: 1-3 sentence next action                   │
└─────────────────────────────────────────────────────┘
       ↓
setMsg(nextAction) → Ready in input box
```

## Key Files

| File | Role |
|------|------|
| `apps/web/app/chat/page.tsx:684-695` | Hook point (bridge_complete) |
| `apps/web/app/api/evaluate-progress/route.ts` | API: askAIFull → Groq pipeline |
| `apps/web/lib/groq/client.ts` | Groq API wrapper |
| `apps/web/lib/stores/goalStore.ts` | Stores PR goal |
| `packages/tools/src/lib/ask-ai-full.ts` | askAIFull implementation |

## API Design

### POST /api/evaluate-progress

**Request:**
```typescript
{
  conversation: string,    // Formatted messages
  prGoal: string,          // The target outcome
  workspace: string        // For askAIFull workspace access
}
```

**Response:**
```typescript
{
  analysis: string,        // Full askAIFull output (for debugging)
  nextAction: string,      // Groq-formatted next message
  onTrack: boolean,        // Quick status flag
  confidence: number       // 0-1 how confident in suggestion
}
```

## askAIFull Prompt Template

```
<conversation>
{formattedMessages}
</conversation>

<pr_goal>
{prGoal}
</pr_goal>

<workspace>
{workspace}
</workspace>

You are a supervisor reviewing an AI agent's progress on a coding task.

Analyze:
1. What has been accomplished so far?
2. Are we on track to reach the PR goal?
3. What mistakes or issues do you see?
4. What files should be checked to verify progress?

Then determine: What is the single BEST NEXT ACTION the user should ask the agent to do?

Be specific. Reference actual files and code if needed.
```

## Groq Prompt Template

```
You are a formatter. Given this analysis of an AI coding session, output ONLY the next message the user should send.

<analysis>
{askAIFullOutput}
</analysis>

Rules:
- Output ONLY the message, no explanation
- Be specific and actionable
- Reference files/functions by name if relevant
- Keep it under 3 sentences
- Start with a verb (Fix, Add, Update, Check, etc.)
```

## Configuration

```typescript
// packages/shared/src/constants.ts
FEATURE_FLAGS: {
  AGENT_SUPERVISOR: boolean,           // Enables this feature
}
```

## Decisions

1. **PR Goal source**: Settings modal → new "Goal" tab → textarea
2. **Groq model**: `qwen-qwq-32b` (thinking model, 120b context)
3. **UI feedback**: TBD
4. **Opt-out**: TBD
5. **Cost tracking**: TBD

## Settings Modal: Goal Tab

Add new tab to `apps/web/components/modals/SettingsModal.tsx`:

```typescript
// Line 49: Add to type
type SettingsTab = "account" | "llm" | "prompts" | "organization" | "websites" | "integrations" | "goal"

// Line 56: Add to tabs array
{ id: "goal", label: "Goal", icon: <Target size={16} /> },

// Line 184: Add to content switch
{activeTab === "goal" && <GoalSettings onClose={onClose} />}
```

**GoalSettings component:**
```typescript
function GoalSettings({ onClose }: { onClose: () => void }) {
  const goal = useGoal()
  const { setGoal } = useGoalActions()

  return (
    <SettingsTabLayout
      title="PR Goal"
      description="Define the larger goal for your coding session. The AI supervisor will evaluate progress against this."
      onClose={onClose}
    >
      <textarea
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        placeholder="e.g., Add user authentication with OAuth2, including login/logout flows and session management..."
        className="w-full h-48 px-4 py-3 ..."
      />
    </SettingsTabLayout>
  )
}
```

## Goal Store

`apps/web/lib/stores/goalStore.ts`:

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface GoalState {
  goal: string
  actions: {
    setGoal: (goal: string) => void
    clearGoal: () => void
  }
}

export const useGoalStore = create<GoalState>()(
  persist(
    (set) => ({
      goal: '',
      actions: {
        setGoal: (goal) => set({ goal }),
        clearGoal: () => set({ goal: '' }),
      },
    }),
    { name: 'goal-storage' }
  )
)

export const useGoal = () => useGoalStore((s) => s.goal)
export const useGoalActions = () => useGoalStore((s) => s.actions)
```

## Implementation Order

1. [x] Create `apps/web/lib/stores/goalStore.ts`
2. [x] Add Goal tab to SettingsModal
3. [x] Use existing `apps/web/lib/clients/groq.ts`
4. [x] Create `/api/evaluate-progress` endpoint
5. [x] Hook into `page.tsx` bridge_complete handler
6. [x] Add feature flag (`FEATURE_FLAGS.AGENT_SUPERVISOR`)
7. [x] Add evaluating state (`isEvaluatingProgress`)

## Files Created/Modified

| File | Action |
|------|--------|
| `apps/web/lib/stores/goalStore.ts` | Created - Zustand store for PR goal |
| `apps/web/components/modals/SettingsModal.tsx` | Modified - Added Goal tab |
| `apps/web/app/api/evaluate-progress/route.ts` | Created - askAIFull → Groq pipeline |
| `apps/web/app/chat/page.tsx` | Modified - Hook into bridge_complete |
| `packages/shared/src/constants.ts` | Modified - Added AGENT_SUPERVISOR flag |

## Usage

1. Set `FEATURE_FLAGS.AGENT_SUPERVISOR = true` in `packages/shared/src/constants.ts`
2. Open Settings → Goal tab
3. Enter your PR goal (e.g., "Add user authentication with OAuth2")
4. Chat with Claude
5. On completion, the supervisor analyzes progress and suggests the next action
