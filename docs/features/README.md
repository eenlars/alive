# Features

Feature-specific documentation and implementation guides.

## Core Features

### Multi-Tenant Workspaces
Each domain gets isolated workspace with sandboxed file access.

**Docs:** [Architecture: Workspace Isolation](../architecture/workspace-isolation.md)

### Real-Time Streaming (SSE)
Server-Sent Events for live Claude responses.

**Docs:** [Architecture: Message Handling](../architecture/message-handling.md)

### Session Persistence
Resume conversations after browser close.

**Docs:** [Architecture: Session Management](../architecture/session-management.md)

### Credit System
User credits converted from LLM tokens at charge time.

**Docs:** [Architecture: Credits & Tokens](../architecture/credits-and-tokens.md)

## Feature List

| Feature | Status | Documentation |
|---------|--------|---------------|
| Workspace-scoped conversations | ✅ Production | [Workspace Isolation](../architecture/workspace-isolation.md) |
| SSE streaming | ✅ Production | [Message Handling](../architecture/message-handling.md) |
| Session persistence | ✅ Production | [Session Management](../architecture/session-management.md) |
| Credit management | ✅ Production | [Credits & Tokens](../architecture/credits-and-tokens.md) |
| Model selection | ✅ Production | [Credits & Tokens](../architecture/credits-and-tokens.md#model-selection) |
| Terminal mode | ✅ Production | [Getting Started](../GETTING_STARTED.md) |
| Package installation (MCP tool) | ✅ Production | See `packages/tools/` |
| Dev server restart (MCP tool) | ✅ Production | See `packages/tools/` |
| SuperTemplates | ✅ Production | See `packages/tools/supertemplate/` |
| User prompt templates | ✅ Production | See `lib/stores/userPromptsStore.ts` |
| Photo library attachments | ✅ Production | See `lib/stores/imageStore.ts` |
| Site deployment | ✅ Production | [Deployment](../deployment/README.md) |
| DNS verification | ✅ Production | See original docs |
| Alive Super Templates | ✅ Production | See `packages/tools/supertemplate/` |
| Claude SDK Execution | ✅ Production | [Execution Flow](./claude-sdk-execution-flow.md) |

## Feature Implementation Notes

### Adding New Features

1. **Plan** - Document architecture first
2. **Security** - Review security implications
3. **Test** - Write tests for security-critical parts
4. **Document** - Add to this list

### MCP Tools

Custom tools in `packages/tools/`:
- `workspace-management/` - Package install, dev server restart
- `tools/` - Guides, templates, workflows

**Adding Tools:** See `packages/tools/ADDING_NEW_TOOLS_INSTRUCTIONS.md`

### Zustand Stores

State management in `lib/stores/`:
- Follow atomic selector pattern
- Export stable `actions` object
- Mark with `"use client"`

**Guide:** `docs/guides/zustand-nextjs-ssr-patterns.md`

## Feature Requests

For new features:
1. Open issue describing use case
2. Discuss architecture approach
3. Review security implications
4. Implement with tests
5. Update documentation

## See Also

- [Architecture](../architecture/README.md) - System design
- [Testing](../testing/README.md) - Write tests
- [Security](../security/README.md) - Security patterns
