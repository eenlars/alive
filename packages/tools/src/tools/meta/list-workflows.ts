import { tool } from "@anthropic-ai/claude-agent-sdk"
import { WORKFLOW_CATEGORIES } from "./get-workflow.js"

export type ListWorkflowsResult = {
  content: Array<{ type: "text"; text: string }>
  isError: boolean
}

export async function listWorkflows(): Promise<ListWorkflowsResult> {
  try {
    const workflows = WORKFLOW_CATEGORIES.map(cat => `- **${cat}**`).join("\n")

    const output = `# Available Workflows

${workflows}

Use \`get_workflow({ workflow_type: "<type>" })\` to retrieve a specific workflow decision tree.

**Available types:**
- bug-debugging
- new-feature
- package-installation
- website-shippable-check
- functionality-check`

    return {
      content: [
        {
          type: "text" as const,
          text: output,
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
          text: `# Failed to list workflows\n\nError: ${errorMessage}`,
        },
      ],
      isError: true,
    }
  }
}

export const listWorkflowsTool = tool(
  "list_workflows",
  `Lists all available workflow decision trees. Use this to discover what workflows exist before retrieving a specific one with get_workflow.

Returns a simple list of available workflow types (bug-debugging, new-feature, package-installation, website-shippable-check, functionality-check).`,
  {},
  async () => {
    return listWorkflows()
  },
)
