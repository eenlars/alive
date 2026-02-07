import { tool } from "@anthropic-ai/claude-agent-sdk"
import { COOKIE_NAMES } from "@webalive/shared"
import { z } from "zod"
import type { ToolResult } from "../../lib/api-client.js"
import { validateWorkspacePath } from "../../lib/workspace-validator.js"

export const switchServeModeParamsSchema = {
  mode: z
    .enum(["dev", "build"])
    .describe("'dev' for development server (hot reload), 'build' for production build (faster, no hot reload)"),
  build_first: z
    .boolean()
    .optional()
    .default(true)
    .describe("When switching to 'build' mode, run the build first (default: true)"),
}

export type SwitchServeModeParams = {
  mode: "dev" | "build"
  build_first?: boolean
}

function getApiBaseUrl(): string {
  const portEnv = process.env.PORT
  if (!portEnv) {
    throw new Error("Invalid PORT environment variable")
  }
  const port = Number.parseInt(portEnv.trim(), 10)
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error("Invalid PORT environment variable")
  }
  return `http://localhost:${port}`
}

/**
 * Switch the workspace between dev server and production build serving.
 *
 * SECURITY MODEL (API Call Pattern):
 * - Uses API call because systemctl requires root privileges
 * - Child process runs as workspace user (after setuid) - cannot execute systemctl
 * - API route runs in parent process (as root) with full privilege
 * - API route validates workspace authorization before executing systemctl
 */
export async function switchServeMode(params: SwitchServeModeParams): Promise<ToolResult> {
  const workspaceRoot = process.cwd()

  try {
    validateWorkspacePath(workspaceRoot)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      content: [
        {
          type: "text",
          text: `✗ Could not find your site folder.\n\nTechnical: ${errorMessage}`,
        },
      ],
      isError: true,
    }
  }

  try {
    const apiUrl = `${getApiBaseUrl()}/api/internal-tools/switch-serve-mode`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 120000)

    const sessionCookie = process.env.ALIVE_SESSION_COOKIE
    const internalSecret = process.env.INTERNAL_TOOLS_SECRET

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sessionCookie && { Cookie: `${COOKIE_NAMES.SESSION}=${sessionCookie}` }),
        ...(internalSecret && { "X-Internal-Tools-Secret": internalSecret }),
      },
      body: JSON.stringify({
        workspaceRoot,
        mode: params.mode,
        buildFirst: params.build_first ?? true,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    const result = (await response.json()) as {
      ok?: boolean
      message?: string
      output?: string
    }

    // For this tool, we want to show the formatted output on both success and failure
    if (result.ok) {
      return {
        content: [{ type: "text", text: result.message || "✓ Mode switched successfully" }],
        isError: false,
      }
    }

    // On failure, show friendly message + technical build output
    const technicalDetails = result.output || result.message || "Unknown error"
    return {
      content: [
        {
          type: "text",
          text: `✗ Build failed. There may be errors in the code that need fixing.\n\nBuild output:\n${technicalDetails}`,
        },
      ],
      isError: true,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    if (errorMessage.includes("aborted")) {
      return {
        content: [
          {
            type: "text",
            text: "✗ Build timed out after 2 minutes. The code may have an infinite loop or very large dependencies.\n\nTry running 'bun run build' manually to see detailed progress.",
          },
        ],
        isError: true,
      }
    }

    return {
      content: [
        {
          type: "text",
          text: `✗ Could not reach the server. Please try again in a moment.\n\nTechnical: ${errorMessage}`,
        },
      ],
      isError: true,
    }
  }
}

export const switchServeModeTool = tool(
  "switch_serve_mode",
  `Switch between development and production mode for the user's website.

**Modes:**
- **dev**: Changes appear instantly as you edit (live reload). Best while making changes.
- **build**: Compiles everything into a fast production version. Best when done editing.

**When to use each:**
- Use "build" when the user wants to see the final, fast version of their site
- Use "dev" when actively making code changes (edits show up immediately)

**Important:** After making code changes, run this tool again with mode: "build" to rebuild. The production version won't update automatically.

**Examples:**
- Deploy to production: switch_serve_mode({ mode: "build" })
- Skip rebuild (serve existing): switch_serve_mode({ mode: "build", build_first: false })
- Go back to editing mode: switch_serve_mode({ mode: "dev" })`,
  switchServeModeParamsSchema,
  async args => {
    return switchServeMode(args)
  },
)
