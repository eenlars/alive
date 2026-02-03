import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

// Define workflow categories based on existing workflow files
export const WORKFLOW_CATEGORIES = [
  "bug-debugging",
  "new-feature",
  "package-installation",
  "website-shippable-check",
  "functionality-check",
] as const

export type WorkflowCategory = (typeof WORKFLOW_CATEGORIES)[number]

// Map workflow types to file names
const WORKFLOW_FILE_MAP: Record<WorkflowCategory, string> = {
  "bug-debugging": "01-bug-debugging-request.md",
  "new-feature": "02-new-feature-request.md",
  "package-installation": "03-package-installation.md",
  "website-shippable-check": "04-website-shippable-check.md",
  "functionality-check": "05-functionality-check.md",
}

export const getWorkflowParamsSchema = {
  workflow_type: z
    .enum(WORKFLOW_CATEGORIES)
    .describe(
      `Type of workflow to retrieve. Available: ${WORKFLOW_CATEGORIES.join(", ")}. Use this to understand step-by-step processes for handling specific request types.`,
    ),
}

export type GetWorkflowParams = {
  workflow_type: WorkflowCategory
}

export type GetWorkflowResult = {
  content: Array<{ type: "text"; text: string }>
  isError: boolean
}

/**
 * Get the absolute path to the workflows directory
 * Works in both dev (ts-node) and production (compiled JS)
 */
function getWorkflowsPath(): string {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = join(__filename, "..")

  // Navigate up from dist/tools/meta/ or src/tools/meta/ to workflows/
  return join(__dirname, "../../../workflows")
}

export async function getWorkflow(params: GetWorkflowParams): Promise<GetWorkflowResult> {
  const { workflow_type } = params

  try {
    const workflowsBasePath = getWorkflowsPath()

    // Find workflow file
    const fileName = WORKFLOW_FILE_MAP[workflow_type]
    if (!fileName) {
      // List available workflows (should never happen due to enum validation)
      return {
        content: [
          {
            type: "text" as const,
            text: `# Workflow Not Found\n\n**Requested:** "${workflow_type}"\n\n**Available workflows:**\n${WORKFLOW_CATEGORIES.map(t => `- ${t}`).join("\n")}\n\nUse one of these workflow types.`,
          },
        ],
        isError: false,
      }
    }

    const filePath = join(workflowsBasePath, fileName)
    const content = await readFile(filePath, "utf-8")

    return {
      content: [
        {
          type: "text" as const,
          text: content,
        },
      ],
      isError: false,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    return {
      content: [
        {
          type: "text" as const,
          text: `# Workflow Retrieval Failed\n\n**Workflow:** "${workflow_type}"\n**Error:** ${errorMessage}\n\nAvailable workflows: ${WORKFLOW_CATEGORIES.join(", ")}`,
        },
      ],
      isError: true,
    }
  }
}

export const getWorkflowTool = tool(
  "get_workflow",
  `Retrieves full workflow decision trees for common development tasks. Always returns the complete workflow content.

Available workflows:
- bug-debugging: Step-by-step debugging process (logs, errors, fixes)
- new-feature: Feature implementation workflow (planning, context, execution)
- package-installation: Package installation and verification workflow
- website-shippable-check: Pre-launch checklist (no gradients, no scale animations, emojis, CLAUDE.md quality, favicon, title)
- functionality-check: Verify everything actually works (buttons, forms, links, no hardcoded data)

Examples:
- get_workflow({ workflow_type: "bug-debugging" }) - Bug debugging workflow
- get_workflow({ workflow_type: "new-feature" }) - Feature implementation workflow
- get_workflow({ workflow_type: "package-installation" }) - Package installation workflow
- get_workflow({ workflow_type: "website-shippable-check" }) - Pre-launch quality checklist
- get_workflow({ workflow_type: "functionality-check" }) - Verify site actually works`,
  getWorkflowParamsSchema,
  async args => {
    return getWorkflow(args)
  },
)
