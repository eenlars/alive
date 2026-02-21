import { appendFileSync } from "node:fs"
import * as Sentry from "@sentry/nextjs"
import { askAIFull } from "@webalive/tools"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireSessionUser } from "@/features/auth/lib/auth"
import { hasSessionCookie } from "@/features/auth/types/guards"
import { structuredErrorResponse } from "@/lib/api/responses"
import { COOKIE_NAMES } from "@/lib/auth/cookies"
import { getGroqClient, withRetry } from "@/lib/clients/groq"
import { ErrorCodes } from "@/lib/error-codes"
import { generateRequestId } from "@/lib/utils"

export const runtime = "nodejs"
export const maxDuration = 120 // 2 minutes for askAIFull + Groq

const LOG_FILE = "/tmp/agent-supervisor.log"

// Track active evaluations for cancellation
// Key: `${userId}::${workspace}`, Value: requestId
const activeEvaluations = new Map<string, string>()
// Track cancelled evaluations
const cancelledEvaluations = new Set<string>()

function logToFile(label: string, data: unknown) {
  const timestamp = new Date().toISOString()
  const entry = `\n=== ${timestamp} [${label}] ===\n${typeof data === "string" ? data : JSON.stringify(data, null, 2)}\n`
  try {
    appendFileSync(LOG_FILE, entry)
  } catch {
    // Ignore write errors
  }
  console.log(`[AgentSupervisor] ${label}:`, typeof data === "string" ? data.slice(0, 500) : data)
}

const RequestSchema = z.object({
  conversation: z.string().min(1),
  prGoal: z.string().min(1),
  workspace: z.string().min(1),
  building: z.string().optional(),
  targetUsers: z.string().optional(),
  model: z.string().optional(),
})

/**
 * Trim conversation to last N messages to save tokens
 * Keeps context manageable while preserving recent history
 */
function trimConversation(conversation: string, maxMessages: number = 15): string {
  // Split by message boundaries (user:/assistant:/agentmanager>)
  const messagePattern = /(?=(?:^|\n)(?:user:|assistant:|agentmanager>))/
  const messages = conversation.split(messagePattern).filter(m => m.trim())

  if (messages.length <= maxMessages) {
    return conversation
  }

  // Keep the last N messages
  const trimmed = messages.slice(-maxMessages)
  return `[...earlier messages trimmed for brevity...]\n\n${trimmed.join("")}`
}

/**
 * Get model reliability context for the agent manager
 */
function getModelContext(model?: string): string {
  if (!model) return "Unknown model - assume moderate reliability"

  const modelLower = model.toLowerCase()

  if (modelLower.includes("opus")) {
    return "Worker is using Claude Opus - HIGH reliability, rarely makes mistakes. Trust its work but still verify."
  }
  if (modelLower.includes("sonnet")) {
    return "Worker is using Claude Sonnet - MODERATE reliability, makes occasional mistakes. Verify its work carefully, especially complex logic."
  }
  if (modelLower.includes("haiku")) {
    return "Worker is using Claude Haiku - LOWER reliability, fast but error-prone. Double-check everything, expect to find issues. Be patient and give clear, simple instructions."
  }

  return `Worker is using ${model} - unknown reliability level. Verify work carefully.`
}

const ASKFULL_PROMPT = `<project_context>
What we're building: {building}
Target users: {targetUsers}
</project_context>

<worker_model>
{modelContext}
</worker_model>

<pr_goal>
{prGoal}
</pr_goal>

<workspace>
{workspace}
</workspace>

<conversation_so_far>
{conversation}
</conversation_so_far>

You are a PR completion verifier with a persistent scratchpad.

## WORKER MODEL RELIABILITY
{modelContext}
- If worker is Haiku: expect more mistakes, be more thorough in verification, give simpler instructions
- If worker is Sonnet: verify carefully but trust moderate complexity
- If worker is Opus: can handle complex tasks, fewer mistakes expected

## MESSAGE TYPES IN CONVERSATION
- Messages WITHOUT "agentmanager>" prefix = REAL USER (human) - these are the actual requirements
- Messages WITH "agentmanager>" prefix = YOU (the manager) from previous turns - these are your own suggestions
- When reading the conversation, prioritize what the REAL USER asked for
- Don't get confused by your own previous suggestions - they're marked with "agentmanager>"

## YOUR ROLE
You are the MANAGER. You READ and VERIFY, but you DON'T edit files yourself.
You suggest actions for the WORKER to execute. The worker has all the tools below.

## TOOLS THE WORKER CAN USE (suggest these, don't run them yourself)
SDK Tools:
- Read(path) - Read file contents
- Write(path, content) - Create new file
- Edit(path, changes) - Modify existing file
- Glob(pattern) - Find files by pattern
- Grep(pattern, path) - Search code
- Bash(command) - Run shell commands

Workspace Tools:
- restart_dev_server - Restart service, clear Vite cache
- install_package - Install npm packages via bun
- check_codebase - Run TypeScript + ESLint checks
- debug_workspace - Quick debugging (logs + status)
- read_server_logs - Read systemd logs with filtering

## WORKFLOWS TO SUGGEST (tell worker to run these)
- "run the website-shippable-check workflow" - Pre-launch quality gate
- "run the functionality-check workflow" - Verify everything WORKS
- "run the bug-debugging workflow" - Debug errors with logs
- "run the package-installation workflow" - Install packages properly

## VERIFICATION BEFORE DONE - CRITICAL
Before saying DONE, ALWAYS have the worker run verification workflows:

1. **After any feature seems complete:**
   - "run the functionality-check workflow" - Does it actually WORK? Click every button, test every flow

2. **After UI/styling changes:**
   - "run the functionality-check workflow" - Did the styling break anything?

3. **Before final DONE:**
   - "run the website-shippable-check workflow" - Full pre-launch quality gate
   - This catches: broken links, console errors, missing meta tags, accessibility issues

Don't trust "I updated the code" - verify it WORKS. The worker often thinks they're done but:
- Button handlers aren't wired up
- Links go nowhere
- Forms don't submit
- Styles look broken on mobile
- Console is full of errors

If the worker hasn't run a check workflow recently, suggest it BEFORE marking as DONE.

## USERS FIRST - THIS IS THE MOST IMPORTANT SECTION
Everything we build is for the USERS described above. They are REAL PEOPLE with real problems.

Before suggesting ANY action, ask yourself:
- Would {targetUsers} actually want this?
- Does this solve THEIR problem or just look cool?
- Would they understand this immediately or be confused?
- What would make them say "finally, someone gets it!"?
- What would make them leave in 3 seconds?

Think like the user:
- They're busy, stressed, probably on mobile
- They don't care about our code, animations, or clever design
- They want their problem SOLVED, fast
- Trust is everything - one sketchy element and they're gone
- They've seen 100 websites today, why should they stay on this one?

Your suggestions should ALWAYS connect back to user value AND explicitly state who the users are:
- NOT: "Add a gradient to the hero"
- NOT: "Like grandma would want..." (where does grandma come from??)
- YES: "Our target users are {targetUsers}. The hero doesn't tell them what they get - add a clear benefit statement like 'Emergency plumber in 30 min'"

Always start suggestions with: "Our target users are [X]. Therefore..."
This makes it crystal clear WHY you're suggesting something.

If something looks pretty but doesn't help the user, KILL IT.

## CODEBASE HYGIENE - FIX THESE BEFORE ANYTHING ELSE
Before working on features, CHECK and FIX foundational issues:

1. **Component Size & Organization** - PREVENT BLOAT
   - Files growing past 400 lines = soft warning, review structure
   - Files at 600+ lines = evaluate if it should be split (don't blindly split)
   - Ask: "Can I explain what this file does in ONE sentence?"
   - Ask: "Are there multiple 'sections' that could be separate modules?"
   - Ask: "Are there reusable parts other files could use?"
   - SPLIT when: mixed concerns (UI + logic + data), multiple unrelated sections, reusable hooks/utils
   - DON'T split: tightly coupled code that belongs together, many small functions in one file, config/constants
   - Extract: custom hooks, sub-components, utility functions
   - Keep: related things together if splitting would create import chaos

2. **CLAUDE.md** - Quick reference for the agent
   - Does it exist? If not, create a SIMPLE one
   - For small websites, it should just contain:
     - Business name & what they do (e.g., "Lars Hallo - Plumber in Amsterdam")
     - Target customers (e.g., "Homeowners in Randstad needing emergency repairs")
     - Contact info (phone, email, address if relevant)
     - Services offered (bullet list)
     - Key selling points (24/7, fast response, guarantees)
     - Design approach (e.g., "Clean, trustworthy, mobile-first")
   - NOT detailed code conventions - that's overkill for landing pages
   - Keep it under 50 lines for simple sites

2. **Dead/Confusing Files** - KILL THEM
   - Old files that are no longer used (backup.tsx, old-component.tsx)
   - Duplicate files (Button.tsx AND button.tsx)
   - Files that don't match the project (leftover template code)
   - Empty files or placeholder files

3. **Basic Code Cleanup** (only if obvious)
   - Console.logs left in production code
   - Placeholder text that was never replaced
   - Broken imports or unused variables

## FIRST: Manage your scratchpad
1. READ the file \`CURRENT_PR.md\` in the workspace root (if it exists)
2. If it doesn't exist, CREATE it with the PR goal and any user requests from the conversation
3. If it exists, UPDATE it with any NEW user requests from the conversation that aren't already tracked
4. The scratchpad format should be:
   \`\`\`markdown
   # Current PR Goal
   [The main PR goal]

   ## User Requests (checklist)
   - [ ] Request 1
   - [ ] Request 2
   - [x] Completed request

   ## Notes
   [Any relevant observations]
   \`\`\`

## THEN: Verify completion
1. READ the relevant files in the workspace to see what actually exists now
2. COMPARE against ALL items in CURRENT_PR.md - mark completed items with [x]
3. WRITE the updated CURRENT_PR.md with checkboxes updated
4. If ALL items complete: respond with "DONE - [brief summary]"
5. If NOT complete: give ONE specific next action for the first unchecked item

## Rules:
- DO NOT ask questions. Just think and act.
- INFER user intent from the code and PR goal - what outcomes would they want?
- Think: "If I were building this, what would make it great?"
- Be concise. One specific action or DONE.

## STOP CONDITIONS - respond with "STOP" if:
- Agent has failed the same task 3+ times (stuck in a loop)
- Agent is making things worse (breaking working code)
- Task requires user input/decision that wasn't provided
- Agent is going off-track and ignoring the PR goal
- More than 10 unchecked items (scope creep - needs user to prioritize)

## READ THE CONVERSATION CAREFULLY
Pay attention to what the WORKER is saying:
- If the worker is ASKING A QUESTION → Don't give more instructions! Answer their question or STOP
- If the worker is CONFUSED → Clarify using the project context (building, targetUsers) or STOP
- If the worker lists multiple options → Pick the one that matches our project context
- If the worker says "which one?" or "I need you to decide" → USE THE PROJECT CONTEXT TO DECIDE

The project context at the top tells you EXACTLY what we're building and for whom.
If the worker is confused about the business/product, ANSWER THEM:
"We're building {building} for {targetUsers}. Use that context."

DON'T just barrel ahead with more instructions when the worker is stuck.

## Common issues to catch:
- Agent said they did something but file shows otherwise
- Partial completion (only some items done)
- Syntax errors or broken code

## DESIGN STANDARDS (if PR involves UI/website work):
- HATE generic, template-looking websites. They're the enemy.
- REJECT anything that looks like generic AI output (bland, corporate, soulless)
- Websites must feel HANDCRAFTED, like premium Framer/Webflow templates
- Push for: unexpected layouts, bold typography choices, micro-interactions, PERSONALITY
- Kill on sight: "Get Started" buttons, generic gradients, stock hero patterns, "trusted by" sections that look like every other site
- Every element should feel intentional and unique, not copy-pasted from a component library`

const GROQ_PROMPT = `You extract the next action from a PR review, written like a human collaborator editing code together.

<analysis>
{analysis}
</analysis>

CRITICAL OUTPUT RULES (follow exactly, no exceptions):
- If analysis says "DONE": your ENTIRE response must start with "DONE" followed by a brief summary
  Example: "DONE - Site is complete with all meta tags and content updated"
  DO NOT write "The output is: DONE" or any preamble - just start with DONE
- If analysis says "STOP": your ENTIRE response must start with "STOP - [reason]"
  Example: "STOP - Worker needs the actual phone number from user"
  DO NOT write any preamble before STOP
- If the worker asked a QUESTION or is CONFUSED: answer their question directly, don't give new instructions
  - e.g., "We're building a plumbing site for Dutch homeowners. Go with the plumber option."
- Otherwise: write like a developer pair-programming, referencing SPECIFIC code:
  - Mention actual file names, line numbers, variable names, or text from the code
  - Be conversational: "The hero still says 'hallo wereld' on line 73 - let's make it say..."
  - "I see the services array is empty - add a few items like..."
  - "That button component looks generic - try adding a gradient or..."
- ONE specific thing to fix, with real context from the analysis
- NO generic instructions like "add social proof" without saying WHERE and WHAT
- Sound like a human who just looked at the code, not a template
- ALWAYS frame suggestions in terms of USER VALUE, not developer tasks
- Think: "What would make the target users trust/convert/stay?"
- NEVER suggest generic stuff like "Add a hero section" - always say WHY it helps the user
- Good: "Users need to see you're local - add 'Serving Amsterdam since 2010' near the phone number"
- Bad: "Add social proof elements to increase conversions"
- ALWAYS explicitly mention WHO the target users are when explaining WHY something matters
- Good: "Our target users are elderly homeowners - they need larger text and a clear phone number"
- Bad: "Like grandma would want..." (unclear where this comes from)
- Reference the target users from <project_context> so the worker understands the reasoning`

/**
 * POST /api/evaluate-progress
 * Analyze conversation progress and suggest next action
 */
export async function POST(req: NextRequest) {
  const requestId = generateRequestId()

  try {
    // Check authentication
    const jar = await cookies()
    if (!hasSessionCookie(jar.get(COOKIE_NAMES.SESSION))) {
      return structuredErrorResponse(ErrorCodes.NO_SESSION, { status: 401, details: { requestId } })
    }

    const user = await requireSessionUser()
    console.log(`[EvaluateProgress] User ${user.id} requesting evaluation`)

    // Parse and validate body
    const body = await req.json().catch(() => ({}))
    const parseResult = RequestSchema.safeParse(body)

    if (!parseResult.success) {
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
        status: 400,
        details: {
          requestId,
          issues: parseResult.error.issues,
        },
      })
    }

    const { conversation, prGoal, workspace, building, targetUsers, model } = parseResult.data

    // Track this evaluation for potential cancellation
    const evaluationKey = `${user.id}::${workspace}`
    activeEvaluations.set(evaluationKey, requestId)

    // Helper to check if this evaluation was cancelled
    const isCancelled = () => cancelledEvaluations.has(requestId)

    // Trim conversation to save tokens (keep last 15 messages)
    const trimmedConversation = trimConversation(conversation, 15)
    const modelContext = getModelContext(model)

    logToFile("REQUEST", {
      workspace,
      prGoal,
      building,
      targetUsers,
      model,
      conversationLength: conversation.length,
      trimmedLength: trimmedConversation.length,
      requestId,
    })

    // Step 1: Ask Claude to analyze the conversation
    const askPrompt = ASKFULL_PROMPT.replace("{conversation}", trimmedConversation)
      .replace("{prGoal}", prGoal)
      .replace("{workspace}", workspace)
      .replace("{building}", building || "Not specified")
      .replace("{targetUsers}", targetUsers || "Not specified")
      .replace(/{modelContext}/g, modelContext)

    logToFile("ASKFULL_PROMPT", askPrompt)

    const startTime = Date.now()

    const askResult = await askAIFull({
      prompt: askPrompt,
      workspace,
      maxTurns: 30, // Allow thorough workspace inspection
    })

    const analysisTime = Date.now() - startTime
    logToFile("ASKFULL_RESULT", {
      text: askResult.text,
      messageCount: askResult.messageCount,
      mode: askResult.mode,
      timing: analysisTime,
    })

    // Check if cancelled after askAIFull (expensive operation)
    if (isCancelled()) {
      logToFile("CANCELLED", { requestId, phase: "after_askAIFull" })
      activeEvaluations.delete(evaluationKey)
      cancelledEvaluations.delete(requestId)
      return NextResponse.json({ ok: true, cancelled: true })
    }

    let nextAction: string
    let groqTime = 0

    // Superadmins skip Groq - use raw analysis directly
    if (user.isSuperadmin) {
      logToFile("SKIP_GROQ", { reason: "superadmin", userId: user.id })
      nextAction = askResult.text
    } else {
      // Step 2: Use Groq to format the output
      const groqPrompt = GROQ_PROMPT.replace("{analysis}", askResult.text)

      logToFile("GROQ_PROMPT", groqPrompt)

      const groqStart = Date.now()

      const groq = await getGroqClient()
      const groqResponse = await withRetry(async () => {
        return groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: groqPrompt }],
          max_tokens: 500,
          temperature: 0.3, // Lower temperature for more focused output
        })
      })

      groqTime = Date.now() - groqStart
      nextAction = groqResponse.choices[0]?.message?.content?.trim() || ""

      logToFile("GROQ_RESULT", {
        nextAction,
        timing: groqTime,
        usage: groqResponse.usage,
      })
    }

    // Determine if on track based on analysis
    const analysisLower = askResult.text.toLowerCase()
    const onTrack =
      !analysisLower.includes("stuck") &&
      !analysisLower.includes("wrong direction") &&
      !analysisLower.includes("major issue") &&
      !analysisLower.includes("not on track")

    const response = {
      ok: true,
      analysis: askResult.text,
      nextAction,
      onTrack,
      timing: {
        analysis: analysisTime,
        formatting: groqTime,
        total: Date.now() - startTime,
      },
    }

    logToFile("RESPONSE", response)

    // Cleanup tracking
    activeEvaluations.delete(evaluationKey)
    cancelledEvaluations.delete(requestId)

    return NextResponse.json(response)
  } catch (error) {
    console.error("[EvaluateProgress] Error:", error)
    Sentry.captureException(error)

    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, {
      status: 500,
      details: {
        requestId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    })
  }
}

/**
 * DELETE /api/evaluate-progress
 * Cancel an active evaluation for the current user's workspace
 */
export async function DELETE(req: NextRequest) {
  const requestId = generateRequestId()

  try {
    // Check authentication
    const jar = await cookies()
    if (!hasSessionCookie(jar.get(COOKIE_NAMES.SESSION))) {
      return structuredErrorResponse(ErrorCodes.NO_SESSION, { status: 401, details: { requestId } })
    }

    const user = await requireSessionUser()

    // Get workspace from query params
    const { searchParams } = new URL(req.url)
    const workspace = searchParams.get("workspace")

    if (!workspace) {
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
        status: 400,
        details: {
          requestId,
          field: "workspace",
        },
      })
    }

    const evaluationKey = `${user.id}::${workspace}`
    const activeRequestId = activeEvaluations.get(evaluationKey)

    if (activeRequestId) {
      // Mark as cancelled - the running evaluation will check this flag
      cancelledEvaluations.add(activeRequestId)
      activeEvaluations.delete(evaluationKey)
      logToFile("CANCEL_REQUESTED", { evaluationKey, activeRequestId })
      return NextResponse.json({ ok: true, cancelled: true, requestId: activeRequestId })
    }

    return NextResponse.json({ ok: true, cancelled: false, message: "No active evaluation found" })
  } catch (error) {
    console.error("[EvaluateProgress] Cancel error:", error)
    Sentry.captureException(error)

    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, {
      status: 500,
      details: {
        requestId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    })
  }
}
