#!/usr/bin/env bun
/**
 * Test Agent Supervisor pipeline
 * Run: bun scripts/test-agent-supervisor.ts
 */

import { askAIFull } from "@webalive/tools"
import Groq from "groq-sdk"

const workspace = "larshallo.alive.best"
const prGoal = "Change the text Uw vertrouwde loodgieter to hallo wereld in the HTML"
const conversation =
  "User: Change Uw vertrouwde loodgieter to hallo wereld\n\nAssistant: I will help you change that text. Let me find and edit the file."

const ASKFULL_PROMPT = `<pr_goal>
${prGoal}
</pr_goal>

<workspace>
${workspace}
</workspace>

<conversation_so_far>
${conversation}
</conversation_so_far>

You are the strict supervisor manager who gives useful suggestions. You can go through the codebase but not edit any file.

You're never happy and want to make the agent fix things properly.

Common agent errors to watch for:
- Doesn't look well enough
- Works on the wrong stuff
- Doesn't check its own work
- Gets into rabbit holes
- Has trouble being creative
- Introduces more complexity than necessary
- Doesn't follow the patterns of the codebase
- Doesn't test code if the rest of the codebase is tested

Check the workspace, analyze what's been done, and give ONE specific actionable suggestion for the next step.`

const GROQ_PROMPT_TEMPLATE = `You are a formatter. Given this analysis of an AI coding session, output ONLY the next message the user should send to continue progress.

<analysis>
ANALYSIS_PLACEHOLDER
</analysis>

Rules:
- Output ONLY the message, no explanation or preamble
- Be specific and actionable
- Reference files/functions by name if relevant
- Keep it under 3 sentences
- Start with a verb (Fix, Add, Update, Check, etc.)
- Do NOT include any meta-commentary`

async function main() {
  console.log("=== Testing Agent Supervisor ===")
  console.log("Workspace:", workspace)
  console.log("Goal:", prGoal)
  console.log("")

  console.log("Step 1: Running askAIFull...")
  const startTime = Date.now()

  const askResult = await askAIFull({
    prompt: ASKFULL_PROMPT,
    workspace,
    maxTurns: 30,
  })

  console.log("askAIFull completed in", Date.now() - startTime, "ms")
  console.log("Message count:", askResult.messageCount)
  console.log("Mode:", askResult.mode)
  console.log("")

  // Log all messages from the agent
  console.log("=== AGENT MESSAGES ===")
  for (const msg of askResult.messages) {
    console.log(`[${msg.type}]`, JSON.stringify(msg, null, 2).slice(0, 2000))
    console.log("---")
  }
  console.log("=== END AGENT MESSAGES ===")
  console.log("")

  console.log("=== ANALYSIS OUTPUT ===")
  console.log(askResult.text)
  console.log("=== END ANALYSIS ===")
  console.log("")

  console.log("Step 2: Running Groq formatting...")
  const groqStart = Date.now()

  const groq = new Groq({ apiKey: process.env.GROQ_API_SECRET || process.env.GROQ_API_KEY })
  const groqPrompt = GROQ_PROMPT_TEMPLATE.replace("ANALYSIS_PLACEHOLDER", askResult.text)

  const groqResponse = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: groqPrompt }],
    max_tokens: 500,
    temperature: 0.3,
  })

  const nextAction = groqResponse.choices[0]?.message?.content?.trim() || ""

  console.log("Groq completed in", Date.now() - groqStart, "ms")
  console.log("")
  console.log("=== NEXT ACTION ===")
  console.log(nextAction)
  console.log("=== END ===")
}

main().catch(console.error)
