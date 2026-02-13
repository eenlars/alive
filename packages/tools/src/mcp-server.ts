import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk"
import { askAutomationConfigTool } from "./tools/ai/ask-automation-config.js"
import { askClarificationTool } from "./tools/ai/ask-clarification.js"
import { askWebsiteConfigTool } from "./tools/ai/ask-website-config.js"
import { debugWorkspaceTool } from "./tools/composite/debug-workspace.js"
import { readServerLogsTool } from "./tools/debug/read-server-logs.js"
import { sendReplyTool } from "./tools/email/send-reply.js"
import { getWorkflowTool } from "./tools/meta/get-workflow.js"
import { listWorkflowsTool } from "./tools/meta/list-workflows.js"
import { searchToolsTool } from "./tools/meta/search-tools.js"
import { generatePersonaTool } from "./tools/personas/generate-persona.js"
import { describeTableTool } from "./tools/supabase/describe-table.js"
import { listProjectsTool } from "./tools/supabase/list-projects.js"
import { listTablesTool } from "./tools/supabase/list-tables.js"
import { runQueryTool } from "./tools/supabase/run-query.js"
import { getAliveSuperTemplateTool } from "./tools/templates/get-template.js"
import { checkCodebaseTool } from "./tools/workspace/check-codebase.js"
import { copySharedAssetTool } from "./tools/workspace/copy-shared-asset.js"
import { createWebsiteTool } from "./tools/workspace/create-website.js"
import { deleteFileTool } from "./tools/workspace/delete-file.js"
import { installPackageTool } from "./tools/workspace/install-package.js"
import { restartServerTool } from "./tools/workspace/restart-server.js"
import { switchServeModeTool } from "./tools/workspace/switch-serve-mode.js"

/**
 * Alive Tools MCP Server
 *
 * Comprehensive tool suite for Alive development platform.
 *
 * **Tool Discovery (Progressive Disclosure):**
 * - search_tools: Find tools by query/category with configurable detail levels (Anthropic best practice)
 *
 * **Composite Tools (Reduce Round Trips):**
 * - debug_workspace: Reads logs + analyzes + suggests fixes in one call
 *
 * **Templates:**
 * - get_alive_super_template: Retrieve Alive Super Template content
 *
 * **Debugging & Diagnostics:**
 * - read_server_logs: Read systemd logs (summary mode, regex filtering, result hints)
 *
 * **Context Efficiency:**
 * All tools implement Anthropic's November 2024 MCP best practices:
 * - Progressive disclosure (load only what's needed)
 * - Context-efficient modes (summary/brief options)
 * - Result hints (suggest next actions)
 * - Aggressive filtering (regex support)
 *
 * Tool names follow MCP pattern: mcp__alive-tools__<tool_name>
 */
export const toolsInternalMcp = createSdkMcpServer({
  name: "alive-tools",
  version: "1.0.0",
  tools: [
    searchToolsTool,
    getWorkflowTool,
    listWorkflowsTool,
    debugWorkspaceTool,
    getAliveSuperTemplateTool,
    readServerLogsTool,
    generatePersonaTool,
    askClarificationTool,
    askWebsiteConfigTool,
    askAutomationConfigTool,
  ],
})

/**
 * Alive Workspace MCP Server
 *
 * Tools for managing workspace dev servers.
 *
 * **Workspace Management:**
 * - restart_dev_server: Restart the systemd dev server for a workspace
 * - install_package: Install a package in the user's workspace using bun
 * - check_codebase: Run TypeScript and ESLint checks on the codebase
 * - delete_file: Delete a file or directory from the workspace (with security protections)
 * - create_website: Deploy a new website with automatic infrastructure setup
 *
 * Tool names follow MCP pattern: mcp__alive-workspace__<tool_name>
 */
export const workspaceInternalMcp = createSdkMcpServer({
  name: "alive-workspace",
  version: "1.0.0",
  tools: [
    restartServerTool,
    installPackageTool,
    checkCodebaseTool,
    deleteFileTool,
    switchServeModeTool,
    copySharedAssetTool,
    createWebsiteTool,
  ],
})

/**
 * Supabase MCP Server
 *
 * Tools for interacting with user's Supabase projects via the Management API.
 * Requires user to connect Supabase via OAuth and configure a project ref.
 *
 * **Available Tools:**
 * - run_query: Execute SQL queries (SELECT, INSERT, CREATE TABLE, etc.)
 * - list_projects: List all accessible Supabase projects
 * - list_tables: List tables in the connected project
 * - describe_table: Get detailed table schema
 *
 * Tool names follow MCP pattern: mcp__supabase__<tool_name>
 */
export const supabaseInternalMcp = createSdkMcpServer({
  name: "supabase",
  version: "1.0.0",
  tools: [runQueryTool, listProjectsTool, listTablesTool, describeTableTool],
})

/**
 * Email MCP Server
 *
 * Tool for email-triggered automations. Only registered when running
 * in conversation mode (email trigger with promptOverride).
 *
 * Tool names follow MCP pattern: mcp__alive-email__send_reply
 */
export const emailInternalMcp = createSdkMcpServer({
  name: "alive-email",
  version: "1.0.0",
  tools: [sendReplyTool],
})
