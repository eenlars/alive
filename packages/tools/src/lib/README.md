# Tools Library

Shared utilities for MCP tools.

## api-client.ts

HTTP client for calling Bridge API routes from MCP tools.

**Auto-validates** `workspaceRoot` in request body before HTTP call.

**Exports:**
- `callBridgeApi(options)` - Makes HTTP request, auto-validates workspace, formats response
- `successResult(message)` - Creates success ToolResult
- `errorResult(message, details?)` - Creates error ToolResult

## workspace-validator.ts

Validates workspace paths before operations.

**Allowed workspace bases:**
- `/srv/webalive/sites/*`
- `/root/webalive/sites/*`

**Exports:**
- `validateWorkspacePath(workspaceRoot)` - Validates path is within allowed bases
- `hasPackageJson(workspaceRoot)` - Checks if workspace has package.json

**Security:** Prevents path traversal, evil paths, and system path access.
