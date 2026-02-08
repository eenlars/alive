## 0.2.34

- Updated to parity with Claude Code v2.1.34

## 0.2.33

- Added `TeammateIdle` and `TaskCompleted` hook events with corresponding `TeammateIdleHookInput` and `TaskCompletedHookInput` types
- Added `sessionId` option to specify a custom UUID for conversations instead of auto-generated ones
- Updated to parity with Claude Code v2.1.33

## 0.2.32

- Updated to parity with Claude Code v2.1.32

## 0.2.31

- Added `stop_reason` field to `SDKResultSuccess` and `SDKResultError` to indicate why the model stopped generating

## 0.2.30

- Added `debug` and `debugFile` options for programmatic control of debug logging
- Added optional `pages` field to `FileReadToolInput` for reading specific PDF page ranges
- Added `parts` output type to `FileReadToolOutput` for page-extracted PDF results
- Fixed "(no content)" placeholder messages being included in SDK output

## 0.2.29

- Updated to parity with Claude Code v2.1.29

## 0.2.28

- Published release (no changelog provided)

## 0.2.27

- Added optional `annotations` support to the `tool()` helper function for specifying MCP tool hints (readOnlyHint, destructiveHint, openWorldHint, idempotentHint)
- Fixed `mcpServerStatus()` to include tools from SDK and dynamically-added MCP servers
- Updated to parity with Claude Code v2.1.27

## 0.2.25

- Updated to parity with Claude Code v2.1.25

## 0.2.24

- Published release (no changelog provided)

## 0.2.23

- Fixed structured output validation errors not being reported correctly
- Updated to parity with Claude Code v2.1.23

## 0.2.22

- Fixed structured outputs to handle empty assistant messages
- Updated to parity with Claude Code v2.1.22

## 0.2.21

- Added `config`, `scope`, and `tools` fields to `McpServerStatus` for richer server introspection
- Added `reconnectMcpServer()` and `toggleMcpServer()` methods for managing MCP server connections
- Added `disabled` status to `McpServerStatus`
- Fixed PermissionRequest hooks not being executed in SDK mode (e.g., VS Code extension)
- Updated to parity with Claude Code v2.1.21

## 0.2.20

- Added support for loading CLAUDE.md files from directories specified via `additionalDirectories` option (requires setting `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` in the `env` option)
- Updated to parity with Claude Code v2.1.20

## 0.2.19

- Added `CLAUDE_CODE_ENABLE_TASKS` env var, set to `true` to opt into the new task system

## 0.2.17

- Updated to parity with Claude Code v2.1.17

## 0.2.16

- Updated to parity with Claude Code v2.1.16

## 0.2.15

- Added notification hook support
- Added `close()` method to Query interface for forcefully terminating running queries
- Updated to parity with Claude Code v2.1.15

## 0.2.14

- Updated to parity with Claude Code v2.1.14

## 0.2.13

- Published release (no changelog provided)

## 0.2.12

- Updated to parity with Claude Code v2.1.12

## 0.2.11

- Updated to parity with Claude Code v2.1.11

## 0.2.10

- Added `skills` and `maxTurns` configuration options to custom agent definitions.

## 0.2.9

- Updated to parity with Claude Code v2.1.9

## 0.2.8

- Updated to parity with Claude Code v2.1.8

## 0.2.7

- Updated to parity with Claude Code v2.1.7

## 0.2.6

- Updated to parity with Claude Code v2.1.6
- Added `claudeCodeVersion` field to `package.json` for programmatically determining compatible CLI version

## 0.2.5

- Updated to parity with Claude Code v2.1.5

## 0.2.4

- Updated to parity with Claude Code v2.1.4

## 0.2.3

- Updated to parity with Claude Code v2.1.3

## 0.2.2

- Published release (no changelog provided)

## 0.2.1

- Published release (no changelog provided)

## 0.2.0 (2026-01-07)

- Added `error` field to `McpServerStatus` for failed MCP server connections
- Updated to parity with Claude Code v2.1.0

## 0.1.77 (2026-01-05)

- Updated to parity with Claude Code v2.0.78

## 0.1.76

- Published release (no changelog provided)

## 0.1.75

- Updated to parity with Claude Code v2.0.75

## 0.1.74

- Updated to parity with Claude Code v2.0.74

## 0.1.73

- Fixed a bug where Stop hooks would not consistently run due to `Stream closed` error
- Updated to parity with Claude Code v2.0.73

## 0.1.72

- Fixed `/context` command not respecting custom system prompts
- Fixed non-streaming single-turn queries to close immediately on first result instead of waiting for inactivity timeout
- Changed V2 session API method `receive()` to `stream()` for consistency with Anthropic SDK patterns
- Updated to parity with Claude Code v2.0.72

## 0.1.71

- Added zod `^4.0.0` as peer dependency option in addition to zod `^3.24.1`
- Added support for AskUserQuestion tool. If using `tools` option, enable by including `'AskUserQuestion'` in list
- Fixed visible console window appearing when spawning Claude subprocess on Windows
- Fixed spawn message being sent to stderr callback (anthropics/claude-agent-sdk-typescript#45)
- Updated to parity with Claude Code v2.0.71

## 0.1.70

- Published release (no changelog provided)

## 0.1.69

- Updated to parity with Claude Code v2.0.69

## 0.1.68

- Fixed a bug where disallowed MCP tools were visible to the model
- Updated to parity with Claude Code v2.0.68

## 0.1.67

- Updated to parity with Claude Code v2.0.67

## 0.1.66

- Fixed project MCP servers from `.mcp.json` not being available when `settingSources` includes `project`
- Updated to parity with Claude Code v2.0.66

## 0.1.65

- Updated to parity with Claude Code v2.0.65

## 0.1.64

- Fixed issues where SDK MCP servers, hooks, or canUseTool callbacks could fail when stdin was closed too early after the first result
- Updated to parity with Claude Code v2.0.64

## 0.1.63

- Updated to parity with Claude Code v2.0.63

## 0.1.62

- Published release (no changelog provided)

## 0.1.61

- Updated to parity with Claude Code v2.0.61
