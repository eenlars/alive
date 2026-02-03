# Alive Workflows

Workflow decision trees for handling specific request types using Alive's tools.

## For New Developers

### What are these files?

Workflow files are **markdown decision trees** that the AI agent retrieves at runtime via the `get_workflow` MCP tool. When a user asks something like "is this ready to ship?" or "debug this error", the agent calls `get_workflow({ workflow_type: "website-shippable-check" })` and receives the full markdown content with step-by-step instructions.

### How they work

1. **Location**: `packages/tools/workflows/*.md`
2. **Registration**: Each workflow must be registered in `src/tools/meta/get-workflow.ts`:
   - Add to `WORKFLOW_CATEGORIES` array
   - Add filename mapping to `WORKFLOW_FILE_MAP`
3. **Discovery**: Also update `src/tools/meta/list-workflows.ts` so `list_workflows` shows the new type
4. **Rebuild**: Run `make dev` to rebuild the tools package after changes

### File permissions

**IMPORTANT**: Workflow files must have `644` permissions (`rw-r--r--`) so the MCP server process can read them. If you create a new file and get `EACCES: permission denied` errors:

```bash
chmod 644 packages/tools/workflows/your-new-workflow.md
```

### Adding new workflows

We expect to add more workflows over time. Follow the pattern:
1. Create `XX-workflow-name.md` (increment the number)
2. Register in `get-workflow.ts` (WORKFLOW_CATEGORIES + WORKFLOW_FILE_MAP)
3. Update `list-workflows.ts` description
4. `chmod 644` the new file
5. `make dev` to rebuild

---

## Purpose

These workflows guide the AI agent through step-by-step processes for common tasks. They use **Alive's tools** and are tailored to our multi-workspace architecture.

## Available Workflows

1. **Bug Debugging** (`01-bug-debugging-request.md`)
   - Debugging workspace issues
   - Using `debug_workspace`, `read_server_logs`, `check_codebase`
   - Server restart and Vite cache clearing

2. **New Feature** (`02-new-feature-request.md`)
   - Implementing new features
   - Package installation and code organization
   - Refactoring patterns

3. **Package Installation** (`03-package-installation.md`)
   - Installing npm packages
   - Handling type definitions
   - Verifying installations

4. **Website Shippable Check** (`04-website-shippable-check.md`)
   - Pre-launch quality gate checklist
   - Visual quality (no gradients, no scale animations, no emojis)
   - Responsive, typography, spacing, color checks
   - AI garbage detection (console.log, localhost URLs, placeholder images)
   - Technical requirements (favicon, meta tags, semantic HTML)

5. **Functionality Check** (`05-functionality-check.md`)
   - Verify everything actually WORKS (not just looks good)
   - Pages exist (no 404s, no "Coming Soon" placeholders)
   - Buttons do something (no empty onClick handlers)
   - Forms submit (no fake submissions)
   - Links go somewhere (no href="#")
   - No placeholder content (Lorem ipsum, John Doe, 555-1234, example.com)
   - User flows work end-to-end (signup, login, contact, checkout)
   - "Pissed user" mindset - find everything that would make users leave

6. **Server Setup Guides** (`server-setup/`)
   - Complete guides for Hono + TanStack Router + Vite architecture
   - [README.md](./server-setup/README.md) - Index and quick start
   - [00-complete-guide.md](./server-setup/00-complete-guide.md) - Comprehensive everything-in-one reference
   - [01-migration.md](./server-setup/01-migration.md) - Quick migration for existing sites
   - [02-tanstack-router.md](./server-setup/02-tanstack-router.md) - File-based routing deep dive

## Tool Categories

### SDK Tools (Always Available)
- `Read(path)` - Read file contents
- `Write(path, content)` - Create new file
- `Edit(path, changes)` - Modify existing file
- `Glob(pattern)` - Find files by pattern
- `Grep(pattern, path)` - Search code

### Alive Tools MCP Server (`mcp__alive-tools__*`)
- `search_tools` - Discover available tools
- `debug_workspace` - Quick workspace debugging (composite)
- `read_server_logs` - Read systemd logs with filtering
- `generate_persona` - Generate AI personas

### Alive Workspace MCP Server (`mcp__alive-workspace__*`)
- `restart_dev_server` - Restart systemd service, clear Vite cache
- `install_package` - Install npm package via bun
- `check_codebase` - Run TypeScript + ESLint checks

## Usage

Workflows are retrieved via the `get_workflow` tool:

```typescript
get_workflow({ 
  workflow_type: "bug-debugging",
  detail_level: "standard" 
})
```

**Workflow Types:**
- `bug-debugging` - Debugging workflows
- `new-feature` - Feature implementation workflows
- `package-installation` - Package installation workflows
- `website-shippable-check` - Pre-launch quality checklist
- `functionality-check` - Verify everything actually works

**Detail Levels:**
- `minimal` - Overview only
- `standard` - Complete decision tree (default)
- `full` - Decision tree + examples

## Architecture Notes

- **Multi-workspace**: Tools operate on workspace-scoped paths
- **Systemd services**: Each workspace has its own systemd service
- **Vite cache**: `restart_dev_server` clears Vite cache
- **File ownership**: Tools run as workspace user (via child process)
- **API calls**: Privileged operations use Bridge API (systemctl, etc.)

## Adding New Workflows

1. Create markdown file: `packages/tools/workflows/XX-workflow-name.md`
2. Follow existing workflow format:
   - Scenario
   - Agent Capabilities
   - Decision Tree
   - Tool Sequence Examples
   - Critical Rules
   - Common Mistakes
   - Tool Reference
3. Update `get_workflow` tool to include new workflow type
4. Update this README

## Workflow Structure

Workflows are self-contained decision trees that guide the AI through common tasks using only available tools. Each workflow includes:
- Scenario description
- Available tools
- Decision tree
- Tool sequence examples
- Critical rules
- Common mistakes
- Tool reference

