# Adding New Tools to @webalive/tools

This package contains custom MCP tools that extend Claude's capabilities in the Claude Bridge application. Tools are organized by category: `guides/`, `debug/`, and `workspace/`.

## Architecture Overview

**Two-Process Model:**
- **Parent** (`apps/web/app/api/claude/stream/route.ts`): SDK runs as root → files owned by root
- **Child** (`apps/web/scripts/run-agent.mjs`): SDK runs as workspace user → files owned by workspace user
- **Auto-detection:** Checks directory ownership with `shouldUseChildProcess()`

**Why Tools Call localhost APIs:**
- Child process = workspace user (no root access)
- Parent process = root
- Tools call `localhost:8998/api/*` to execute privileged operations (systemctl, etc.)

**MCP Tool Naming:**
```
tool("restart_dev_server")  →  createSdkMcpServer({ name: "workspace-management" })
    └─→ Full name: "mcp__workspace-management__restart_dev_server"
                    (use this in allowedTools)
```

## Critical Requirements

### 1. Zod Version - MUST BE 3.x

⚠️ **IMPORTANT:** The SDK requires Zod 3.25.0+ but is **NOT compatible with Zod 4.x**

```bash
# Correct version
bun add zod@^3.25.0

# WRONG - Will cause "keyValidator._parse is not a function" error
bun add zod@^4.0.0
```

**Why:** Zod 4.x changed internal APIs. The SDK uses `_parse` method which doesn't exist in v4.

### 2. Schema Format - Raw Shape, NOT z.object()

```typescript
// ✅ CORRECT - Pass raw Zod shape
tool(
  "my_tool",
  "Description",
  {
    field: z.string().describe("Field description")
  },
  async (args) => { /* handler */ }
)

// ❌ WRONG - Don't wrap in z.object()
tool(
  "my_tool",
  "Description",
  z.object({  // SDK wraps this internally!
    field: z.string().describe("Field description")
  }),
  async (args) => { /* handler */ }
)
```

**Why:** The SDK's `tool()` function expects a raw Zod shape object and wraps it internally.

### 3. MCP Servers Config - Object, NOT Array

```typescript
// ✅ CORRECT - Object with server name as key
const claudeOptions: Options = {
  mcpServers: {
    "server-name": myMcpServer
  }
}

// ❌ WRONG - Array format doesn't work
const claudeOptions: Options = {
  mcpServers: [myMcpServer]
}
```

### 4. Tool Names - Use Full MCP Prefix

When MCP tools are registered, they get prefixed with `mcp__{server-name}__{tool-name}`.

```typescript
// Tool definition
const myTool = tool("my_tool_name", "Description", schema, handler)

// MCP server
const myServer = createSdkMcpServer({
  name: "my-category",
  tools: [myTool]
})

// ✅ CORRECT - Use full MCP name in allowedTools
allowedTools: [
  "Write", "Edit", "Read", "Glob", "Grep",
  "mcp__my-category__my_tool_name"
]

// ❌ WRONG - Just the tool name won't work
allowedTools: ["my_tool_name"]
```

## How to Add a New Tool

### Step 1: Create the Tool File

Create a new file in `src/tools/[category]/` (e.g., `src/tools/debug/my-tool.ts`):

```typescript
import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

export const myToolParamsSchema = {
  param1: z.string().describe("Description of param1"),
  param2: z.number().optional().describe("Optional param2")
}

export type MyToolParams = {
  param1: string
  param2?: number
}

export type MyToolResult = {
  content: Array<{ type: "text"; text: string }>
  isError: boolean
}

export async function myTool(params: MyToolParams): Promise<MyToolResult> {
  try {
    const { param1, param2 } = params

    const result = doSomething(param1, param2)

    return {
      content: [
        {
          type: "text" as const,
          text: `✓ Success: ${result}`
        }
      ],
      isError: false
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    return {
      content: [
        {
          type: "text" as const,
          text: `✗ Error: ${errorMessage}`
        }
      ],
      isError: true
    }
  }
}

export const myToolTool = tool(
  "my_tool_name",
  "Clear description of what this tool does.",
  myToolParamsSchema,
  async (args) => {
    return myTool(args)
  }
)
```

### Step 2: Add to Tool Registry

Add metadata to `src/tools/meta/tool-registry.ts`:

```typescript
export const TOOL_REGISTRY: ToolMetadata[] = [
  // ... existing tools
  {
    name: "my_tool_name",
    category: "debugging",  // or your category
    description: "Clear description of what this tool does",
    contextCost: "medium",  // "low" | "medium" | "high"
    enabled: true,  // Set to false to disable
    parameters: [
      {
        name: "param1",
        type: "string",
        required: true,
        description: "Description of param1",
      },
      {
        name: "param2",
        type: "number",
        required: false,
        description: "Optional param2",
      },
    ],
  },
]
```

### Step 3: Register in MCP Server

Update `src/mcp-server.ts` to import and register the tool:

```typescript
import { myToolTool } from "./tools/debug/my-tool.js"

export const debugToolsMcp = createSdkMcpServer({
  name: "debug-tools",
  version: "1.0.0",
  tools: [/* existing tools */, myToolTool]
})
```

Or create a new MCP server if it's a distinct category:

```typescript
export const myToolsMcp = createSdkMcpServer({
  name: "my-category",
  version: "1.0.0",
  tools: [myToolTool]
})
```

### Step 3: Export from Package

Update `src/index.ts` to export the new tool and/or MCP server:

```typescript
export { myToolTool } from "./tools/debug/my-tool.js"
export { debugToolsMcp } from "./mcp-server.js"  // if new server
```

### Step 4: Register in Web App

Update `apps/web/app/api/claude/stream/route.ts`:

```typescript
import { myToolsMcp } from "@webalive/tools"

const claudeOptions: Options = {
  mcpServers: {
    "my-category": myToolsMcp,
    // ... other servers
  },
  allowedTools: [
    "Write", "Edit", "Read", "Glob", "Grep",
    "mcp__my-category__my_tool_name"
  ]
}
```

Also update `apps/web/scripts/run-agent.mjs`:

```javascript
import { myToolsMcp } from "@webalive/tools"

const agentQuery = query({
  prompt: request.message,
  options: {
    mcpServers: {
      "my-category": myToolsMcp,
      // ... other servers
    },
    allowedTools: [
      "Write", "Edit", "Read", "Glob", "Grep",
      "mcp__my-category__my_tool_name"
    ]
  }
})
```

### Step 5: Run Tests

The sync test ensures you didn't forget to update both the MCP server and tool registry:

```bash
cd packages/tools

# Run the sync test (catches missing registrations)
bun run test tool-registry-sync

# Or run all tests
bun run test

# Build the package
bun run build
bun run lint
```

**The test will fail if:**
- ✗ Tool added to MCP server but not in tool-registry.ts
- ✗ Tool added to tool-registry.ts but not in MCP server
- ✗ Tool enabled in registry but removed from MCP server
- ✗ Tool disabled in registry but still in MCP server
- ✗ Workspace category tool registered in toolsInternalMcp instead of workspaceInternalMcp
- ✗ Non-workspace tool registered in workspaceInternalMcp instead of toolsInternalMcp
- ✗ Tool has duplicate parameter names
- ✗ Tool parameter missing name, type, or description
- ✗ Tool parameter has invalid type (not string, number, boolean, array, or object)
- ✗ Tool parameter description is too short (< 10 characters)
- ✗ Tool description is too short (< 20 characters) or contains placeholders (TODO, TBD, etc.)
- ✗ Duplicate tool names in registry

### Step 6: Deploy and Test

```bash
# Restart staging to test
systemctl restart alive-staging
```

## Tool Response Format

All tools must return `CallToolResult`:

```typescript
type CallToolResult = {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;  // For type: 'text'
  }>;
  isError?: boolean;
}
```

**For text responses:**
```typescript
{
  content: [
    {
      type: "text" as const,
      text: "Response message"
    }
  ],
  isError: false
}
```

## Directory Structure

```
packages/tools/
├── src/
│   ├── index.ts                          # Main exports
│   ├── mcp-server.ts                     # MCP server definitions
│   ├── tools/
│   │   ├── guides/                       # Guide tools
│   │   │   ├── list-guides.ts
│   │   │   └── get-guide.ts
│   │   ├── debug/                        # Debugging tools
│   │   │   └── read-server-logs.ts
│   │   └── workspace/                    # Workspace management
│   │       └── restart-server.ts
│   └── internals-folder/                 # Knowledge base
├── dist/                                  # Compiled output
├── package.json
├── tsconfig.json
└── ADDING_NEW_TOOLS_INSTRUCTIONS.md      # This file
```

## Common Errors & Solutions

### Error: "keyValidator._parse is not a function"

**Cause:** Using Zod 4.x instead of Zod 3.x

**Solution:** Downgrade to Zod 3.x:
```bash
bun remove zod && bun add zod@^3.25.0
```

### Error: Tool doesn't appear in Claude's tool list

**Cause:** Missing MCP prefix in `allowedTools` or wrong `mcpServers` format

**Solution:** Use full tool name: `mcp__server-name__tool-name` and object format for `mcpServers`

### Error: Permission prompts appearing

**Cause:** `permissionMode` not set correctly

**Solution:** Use `permissionMode: "acceptEdits"` (not `"default"`)

## Best Practices

- Use snake_case for tool names
- Be specific in descriptions (Claude uses them to decide when to invoke)
- Always wrap in try/catch
- Return clear error messages
- Use meaningful parameter names with descriptions
- Organize tools by category in `src/tools/[category]/`
- Separate business logic from tool registration
- Export both the function and the MCP tool
- Keep tools focused on a single responsibility

## Important Notes

- Register tools in BOTH parent (`stream/route.ts`) AND child (`run-agent.mjs`)
- Use `localhost:8998` for privileged operations
- No sudo needed (APIs run as root via systemd)
- All code must pass TypeScript strict mode
- Run `bun run lint` and `bun run format` before committing
- Update `packages/tools/README.md` when adding new tools

## Debugging

**Tool not appearing:**
```bash
journalctl -u alive-staging -n 50 | grep -i mcp
# Check tool name: mcp__server-name__tool-name
```

**Tool fails:**
```bash
# Test API directly
curl -X POST http://localhost:8998/api/your-endpoint \
  -H "Content-Type: application/json" \
  -d '{"param": "value"}'

# Check logs
journalctl -u alive-staging | grep -i error
```

**Build issues:**
```bash
cd packages/tools
bun run build    # Compile TypeScript
bun run lint     # Check code quality
bun run format   # Format code
```

## SDK Documentation

For more details, see the official SDK documentation:
- [Custom Tools Guide](https://docs.anthropic.com/en/docs/agents-and-tools/custom-tools)
- [TypeScript SDK Reference](https://docs.anthropic.com/en/api/agent-sdk/typescript)
