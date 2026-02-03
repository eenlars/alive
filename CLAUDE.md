# Claude Bridge Development Guide

AI assistant guidelines for working on Claude Bridge.

**Quick Links:** [Getting Started](./docs/GETTING_STARTED.md) | [Architecture](./docs/architecture/README.md) | [Security](./docs/security/README.md) | [Testing](./docs/testing/README.md)

## Core Rules

1. **SHORTEST FEEDBACK LOOP** - The best way to test something is by creating a feedback loop that is as short as possible. The easiest way for testing functionality is creating something for yourself to be able to OBSERVE something quickly if working on it. For example, directly calling an API, or creating some flow/script to quickly grasp the workings. Be relentlessly resourceful.
2. **NEVER COMMIT** - Never create commits
3. **ALWAYS USE BUN** - Runtime and package manager
4. **GIT HOOKS** - Pre-push hooks run automatically; if they fail, fix the issues (don't force-push)
5. **NO RANDOM ENV VARS** - Don't add environment variables unless absolutely necessary. Use existing config, constants, or code-level defaults instead. Adding .env variables creates deployment complexity and hidden dependencies.
6. **NO EXPLORE AGENT** - Never use `Task(subagent_type=Explore)`. Use Glob and Grep directly instead - they're faster and more precise for this codebase.
7. **USE THE BRAIN** - Query `use_this_to_remember.db` for past decisions, insights, and context before starting work. Store important learnings when you're done.
8. **CADDYFILE IS LARGE** - The Caddyfile at `/root/webalive/claude-bridge/ops/caddy/Caddyfile` is too large to read in one go. Use `Read` with `offset` and `limit` parameters, or use `Grep` to find specific domain configurations.
9. **OWN YOUR CHANGES** - When deploying or committing, NEVER say "these unrelated changes are not mine" or refuse to include changes in the working directory. If changes exist, they are part of the current work. Take responsibility and include them.
10. **SEEMINGLY UNRELATED ISSUES ARE OFTEN RELATED** - When you see multiple errors or issues, assume they share a common cause until proven otherwise. Type errors in test files often stem from the same interface change. Build failures across packages usually have one root cause. Don't treat each error as isolated - find the pattern first.
11. **INVESTIGATE BEFORE FIXING** - When something is "broken", first understand what it IS. Not all `*.goalive.nl` domains are Vite websites. Check nginx config, caddy-shell config, and existing services before creating anything new.
12. **DEPLOYMENTS REQUIRE NOHUP** - When deploying staging/production, ALWAYS use `nohup make staging > /tmp/staging-deploy.log 2>&1 &` (never bare `make staging`). If your chat session disconnects or you cancel, bare commands leave orphaned build processes that stack up and crash production. Check `tail -f /tmp/staging-deploy.log` for progress. NEVER run deployment commands multiple times - wait for the first to complete.
13. **ONE DEPLOYMENT AT A TIME** - Before starting any deployment, check if one is already running: `make deploy-status`. If a deployment is running, WAIT. Do not start another. Stacked deployments cause memory exhaustion and production outages.
14. **CLEAN BEFORE DEPLOY** - Before ANY deployment, check for orphaned processes: `ps aux | grep -E "make|ship|turbo|next build" | grep -v grep`. If you see old ones, kill them: `pkill -9 -f "ship.sh|build-and-serve|turbo|next build"` and remove stale lock: `rm -f /tmp/claude-bridge-deploy.lock`. Only then deploy.
15. **DEBUG STREAM ERRORS** - When users report "error while streaming", find root cause: `journalctl -u claude-bridge-staging | grep "STREAM_ERROR:<error-id>"`. See [docs/troubleshooting/stream-errors.md](./docs/troubleshooting/stream-errors.md).

## Learn from OpenClaw (IMPORTANT)

**OpenClaw** (formerly ClawdBot) is installed at `/opt/services/clawdbot/`. It's a well-architected open-source AI assistant with battle-tested patterns.

**When building new features, ALWAYS check OpenClaw first:**
```bash
# Search for relevant patterns
ls /opt/services/clawdbot/src/
grep -r "your-feature" /opt/services/clawdbot/src/
```

**Patterns we've already adopted:**
- `proper-lockfile` for file-based locking (OAuth refresh)
- `retryAsync` with exponential backoff and jitter (`@webalive/shared`)
- `createDedupeCache` for TTL-based deduplication (`@webalive/shared`)
- OAuth token auto-refresh with 5-minute buffer

**Patterns worth exploring:**
- `/opt/services/clawdbot/src/security/external-content.ts` - Prompt injection protection for webhooks
- `/opt/services/clawdbot/src/security/audit.ts` - Security audit system with findings/remediation
- `/opt/services/clawdbot/src/infra/` - Infrastructure utilities (ports, restart, ssh-tunnel, etc.)
- `/opt/services/clawdbot/src/memory/` - Embeddings and vector search for conversation memory
- `/opt/services/clawdbot/src/sessions/` - Session management patterns

**The goal:** Don't reinvent. When you need retry logic, deduplication, rate limiting, security patterns, or infrastructure utilities - check OpenClaw first. Copy what works, adapt to our architecture.

## Special Domains (NOT websites)

These domains are **NOT** Vite website templates. Do not deploy them as sites:

| Domain | What it is | Service | Port | Routing |
|--------|-----------|---------|------|---------|
| `go.goalive.nl` | Go shell-server | `shell-server-go.service` | 3888 | nginx → caddy-shell (8443) → 3888 |
| `shell.terminal.goalive.nl` | Go shell-server | `shell-server-go.service` | 3889 | nginx → caddy-shell (8443) → 3889 |
| `sk.goalive.nl` | Go shell-server | `shell-server-go.service` | 3889 | nginx → caddy-shell (8443) → 3889 |
**Nginx SNI routing**: These domains route through `caddy-shell` (not main Caddy) for SSE/WebSocket isolation. Config: `/etc/nginx/nginx.conf` and `/etc/caddy/caddy-shell.Caddyfile`.

## Architecture Smell Detector

12. **ARCHITECTURE SMELL DETECTOR** - Warn when you see these anti-patterns:
   - Adding more tools/features to solve a problem (instead of one core constraint)
   - "Let the AI figure it out" instead of clear success criteria
   - Flexibility/options when opinionated defaults would work
   - Integrating everything instead of doing one thing exceptionally well
   - Complex autonomy when simple rules would suffice
   - Building for "power users" that don't exist yet
   - Asking users what they want instead of telling them how it works

   **What winners did:**
   - Linear: speed as the constraint. Everything keyboard-first, opinionated, no plugins.
   - Figma: multiplayer as the constraint. Every feature designed for "5 people in this file."
   - Superhuman: $30/mo email with NO features. Just fast. Trained users how to use it.
   - Discord: communities as the constraint. Servers/roles, not "workplace collaboration."

   **The pattern:** Strong opinions, great defaults, ONE core constraint that drives every decision.

   **Our core constraint: Agents do what they promise. No mistakes.**
   - Can't promise what it can't verify
   - Must know when to STOP, not try and break things
   - Small scope = verifiable scope

   If you spot the anti-patterns, say: **"⚠️ Architecture smell: [pattern]. Does this help agents do exactly what they promise, or does it add ways to fail?"**

## Agent Memory (IMPORTANT)

**`use_this_to_remember.db`** - SQLite database at project root containing persistent knowledge across conversations.

**ALWAYS check this first** when working on unfamiliar areas:
```bash
sqlite3 use_this_to_remember.db "SELECT topic, content FROM memories WHERE topic LIKE '%your-topic%'"
```

**Store important learnings** when you discover something:
```bash
sqlite3 use_this_to_remember.db "INSERT INTO memories (id, type, topic, content, context, tags) VALUES (lower(hex(randomblob(16))), 'insight', 'topic-name', 'what you learned', 'why it matters', '[\"tag1\",\"tag2\"]')"
```

**Memory types:** `decision` | `insight` | `pattern` | `todo` | `question` | `context` | `preference`

**Quick queries:**
```bash
# All decisions
sqlite3 use_this_to_remember.db "SELECT topic, content FROM memories WHERE type='decision'"

# Search everything
sqlite3 use_this_to_remember.db "SELECT * FROM memories WHERE content LIKE '%keyword%'"

# Recent memories
sqlite3 use_this_to_remember.db "SELECT topic, type, substr(content,1,100) FROM memories ORDER BY created_at DESC LIMIT 10"
```

**User shortcut:** When the user says `usemem`, query recent memories to recall what we were working on:
```bash
sqlite3 use_this_to_remember.db "SELECT type, topic, content, context FROM memories ORDER BY created_at DESC LIMIT 10"
```

**Conversation summaries:** Store summaries of completed sessions for continuity:
```bash
# Read recent conversation summaries
sqlite3 use_this_to_remember.db "SELECT title, summary, next_steps FROM conversations ORDER BY created_at DESC LIMIT 5"

# Store a conversation summary when ending a session
sqlite3 use_this_to_remember.db "INSERT INTO conversations (id, title, summary, key_decisions, next_steps) VALUES (lower(hex(randomblob(16))), 'Brief title', 'What we accomplished', 'Key decisions made', 'What to do next')"
```

## Project Overview

Claude Bridge is a **multi-tenant development platform** that enables Claude AI to assist with website development through controlled file system access. Key characteristics:

- **Multi-tenant architecture**: Each domain gets isolated workspace
- **Security-first design**: Workspace sandboxing, systemd isolation, process separation
- **TURBOREPO Next.js 16 + React 19**: Modern App Router architecture using **Turborepo** for building and deploying the project.
- **SSE streaming**: Real-time Claude responses via Server-Sent Events
- **Tool-based interaction**: Limited to safe file operations (Read, Write, Edit, Glob, Grep)
- **Superadmin access**: Users in `SUPERADMIN_EMAILS` env var can edit this repo via the frontend (workspace: `claude-bridge`, runs as root, all tools enabled)

## Monorepo Structure

### Apps (Deployable Services)

| App | Port | Purpose |
|-----|------|---------|
| `web` | 8997/9000 | Main Next.js app: Chat UI, Claude API, file ops, auth, deployments |
| `broker` | configurable | Message broker for streaming state machines and persistence (Dexie) |
| `shell-server` | - | Web terminal (node-pty + xterm.js) + CodeMirror file editor |
| `shell-server-go` | - | Go rewrite of shell-server (WIP) |
| `image-processor` | 5012 | Python/FastAPI image manipulation service |
| `mcp-servers/google-scraper` | - | MCP server for Google Maps business search |

### Packages (Shared Libraries)

| Package | Purpose |
|---------|---------|
| `@webalive/shared` | Constants, environment definitions, database types. Almost everything depends on this. |
| `@webalive/database` | Auto-generated Supabase types (`iam.*`, `app.*` schemas) |
| `@alive-brug/tools` | Claude's workspace tools (Read, Write, Edit, Glob, Grep) + MCP server |
| `@webalive/site-controller` | Shell-Operator deployment: TS orchestrates, bash executes systemd/caddy/users |
| `@webalive/oauth-core` | Multi-tenant OAuth with AES-256-GCM encrypted token storage |
| `@alive-brug/redis` | ioredis wrapper with Docker setup for sessions/caching |
| `@webalive/env` | Zod-validated env vars via @t3-oss/env-nextjs |
| `@webalive/worker-pool` | Unix socket IPC for warm Claude SDK workers |
| `@alive-brug/images` | Native image processing via @napi-rs/image |
| `@alive-game/alive-tagger` | Vite plugin: injects source locations so Claude knows file:line from UI clicks |
| `@webalive/bridge-types` | TypeScript types for SSE streaming protocol |

### Request Flow (Claude Chat)

```
Browser → /api/claude/stream → Claude Agent SDK → tool callbacks
                                                       ↓
                                              @alive-brug/tools
                                                       ↓
                                              workspace sandbox
                                              /srv/webalive/sites/[domain]/
```

Tools validate paths via `isPathWithinWorkspace()` before any file operation.

## Core Architecture Patterns

### 1. Workspace Isolation & Privilege Separation

**Guide**: `apps/web/docs/architecture/workspace-privilege-separation.md`

**🔥 CRITICAL RULE**: When working on package installs, file operations, builds, or ANY command that touches workspace files, you **MUST** read the guide first.

**Quick facts:**
- Each website = own workspace = own system user (e.g., `site-example-com`)
- Bridge runs as root, spawns children that drop to workspace user
- Use `runAsWorkspaceUser()` for commands, not `spawnSync()`
- Pattern in `lib/workspace-execution/`

**Workspace locations:**
- Sites: `/srv/webalive/sites/[domain]/` (systemd-managed, secure)

**Path validation:**
```typescript
if (!isPathWithinWorkspace(filePath, workspacePath)) {
  throw new Error('Path traversal attack detected')
}
```

### 2. Session Management

**Pattern**: Each browser tab = one independent chat session. Sessions are keyed by `userId::workspace::tabId`

```typescript
// Session key builder
import { tabKey } from '@/features/auth/lib/sessionStore'
const key = tabKey({ userId, workspace, tabId })
// → "userId::workspace::tabId"

// Session store interface
interface SessionStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}
```

**Implementation**: Supabase IAM-backed (`iam.sessions` table) with domain_id caching. Sessions persist across server restarts.

### 3. Streaming & SSE Protocol

**Event Types:**
- `start` - Conversation initialization
- `message` - Each SDK message (assistant/user/thinking/tool)
- `session` - Session ID for resumption
- `complete` - Final completion with result
- `error` - Error information

**Tool Tracking Pattern:**
```typescript
// Global map tracks tool invocations
const toolUseMap = new Map<string, string>()

// Assistant message with tool_use
toolUseMap.set(tool_use_id, tool_name)

// User message with tool_result
const toolName = toolUseMap.get(tool_use_id)
```

This enables proper component rendering for interleaved messages.

### 4. Conversation Locking

**CRITICAL**: Prevent concurrent requests to same conversation

```typescript
import { tabKey } from '@/features/auth/lib/sessionStore'
const key = tabKey({ userId, workspace, tabId })

if (activeConversations.has(key)) {
  return res.status(409).json({ error: 'Conversation in progress' })
}

activeConversations.add(key)
try {
  // SDK query
} finally {
  activeConversations.delete(key)
}
```

### 5. Model Selection & Credits

**CRITICAL**: Credit users restricted to DEFAULT_MODEL for cost management.

See [docs/architecture/CREDITS_AND_TOKENS.md](./docs/architecture/CREDITS_AND_TOKENS.md) for model enforcement patterns.

## Development Guidelines

### File Structure Conventions

```
apps/web/
├── app/
│   ├── api/              # API routes (Next.js route handlers)
│   │   ├── claude/       # Claude SDK integration
│   │   ├── files/        # File operations
│   │   ├── login/        # Authentication
│   │   └── manager/      # Domain password management
│   ├── chat/             # Chat UI
│   ├── workspace/        # Workspace selection
│   └── globals.css       # Global styles
├── components/           # React components
│   ├── ui/              # Reusable UI components
│   └── [feature]/       # Feature-specific components
└── lib/                  # Utility libraries
    ├── security.ts      # Security utilities
    ├── sessions.ts      # Session management
    └── claude.ts        # Claude SDK helpers
```

### Security Guidelines

**ALWAYS follow these security rules:**

1. **Path Validation**: Use `isPathWithinWorkspace()` before any file operation
2. **User Isolation**: New sites MUST use systemd deployment (dedicated users)
3. **Tool Restrictions**: Only expose Read, Write, Edit, Glob, Grep to Claude
4. **Session Security**: Never expose session keys in logs or responses
5. **Password Storage**: User passwords in Supabase `iam.users.password_hash` (bcrypt)

### Code Style

- **Formatting**: Use `bun run format` (Biome)
- **Linting**: Use `bun run lint` (Biome)
- **TypeScript**: Strict mode enabled, no implicit any
- **React**: Use hooks, functional components only
- **Error Handling**: Always catch and properly format errors for SSE

### Git Hooks (Husky)

**IMPORTANT**: This project uses Husky for automated quality checks. Hooks run automatically and cannot be disabled without `--no-verify`.

#### Pre-Commit Hook
- **What it does**: Formats only the files being committed using `lint-staged`
- **Speed**: Instant (only touches staged files)
- **When it runs**: Every `git commit`

#### Pre-Push Hook
- **What it does**: Runs comprehensive checks before allowing push
  - Type checking (`turbo run type-check`)
  - Linting (`turbo run lint`)
  - Format checking (`turbo run format`)
  - Unit tests (`bun run unit`)
- **Speed**: 10-60 seconds (uses Turborepo cache)
- **When it runs**: Every `git push`

#### If Pre-Push Hook Fails

**DO:**
1. Read the error output carefully
2. Fix the type errors, lint errors, or test failures
3. Run `bun run static-check` locally to verify fixes
4. Commit the fixes and push again

**DON'T:**
- Use `git push --no-verify` to bypass checks
- Force push to circumvent quality gates
- Ignore failing tests or type errors

**Manual Testing:**
```bash
# Test what pre-push will run
bun run static-check

# Or test individual checks
bun run type-check
bun run lint
bun run unit
```

**Common Issues:**
- **"bun: command not found" in GUI clients**: See README.md Git Hooks Setup section
- **Slow pre-push**: First run is slow; subsequent runs use Turbo cache and are fast
- **Test failures**: Some tests may require environment setup (see Testing Guide)

### Common Tasks

#### Adding a New API Endpoint

1. Create route handler in `app/api/[name]/route.ts`
2. Import and use `getCookieUserId()` for authentication
3. Validate workspace if file operations involved
4. Return proper status codes (401, 400, 500, etc.)
5. **Write tests in `app/api/[name]/__tests__/route.test.ts`** (MANDATORY!)
   - See "When to Write Tests" section for minimum required tests
   - File operations require additional security tests

#### Modifying Claude Integration

**Files to update:**
- `apps/web/app/api/claude/stream/route.ts` - SSE streaming endpoint
- `apps/web/app/api/claude/route.ts` - Polling endpoint
- `apps/web/lib/claude.ts` - SDK helpers and tool configuration

**Key considerations:**
- Tool callbacks must handle workspace paths correctly
- All tool operations must be logged
- Errors should be streamed as SSE events, not thrown

#### Migrating Config Files

**⚠️ CRITICAL**: Config/file migrations can break production. Always follow the safe migration guide.

**Required reading**: [`docs/guides/safe-config-migration.md`](./docs/guides/safe-config-migration.md)

**Quick checklist:**
1. ✅ Document the migration plan
2. ✅ Search for ALL references: `grep -r "old-file" .`
3. ✅ Validate before deleting: `./scripts/validate-no-deleted-refs.sh old-file`
4. ✅ Test service restarts: `systemctl restart claude-bridge-dev && journalctl -u claude-bridge-dev -n 20`
5. ✅ Run full test suite: `bun run test && bun run test:e2e`

**Never**:
- ❌ Delete files before updating all references
- ❌ Skip the validation script
- ❌ Use dynamic requires in npm scripts: `$(node -p "require('./config').value")`

**See also**: [Postmortem: 2025-11-23 Config Migration Outage](./docs/postmortems/2025-11-23-config-migration-outage.md)

#### Deploying a New Site

**Site deployments use the `@webalive/site-controller` package with the Shell-Operator Pattern:**

```bash
# Via API (authenticated deployment - primary method)
# POST /api/deploy-subdomain with { domain, email, password? }

# Or programmatically:
import { SiteOrchestrator } from '@webalive/site-controller'

const result = await SiteOrchestrator.deploy({
  domain: 'newsite.com',
  slug: 'newsite-com',
  templatePath: PATHS.TEMPLATE_PATH,
  serverIp: DEFAULTS.SERVER_IP,
  wildcardDomain: DEFAULTS.WILDCARD_DOMAIN,
  rollbackOnFailure: true  // Automatic rollback on failure
})

if (result.success) {
  console.log(`Deployed: ${result.domain} on port ${result.port}`)
} else {
  console.error(`Failed at phase: ${result.failedPhase}`)
  // Infrastructure automatically rolled back
}
```

**Creates:**
- Systemd service: `site@newsite-com.service`
- Dedicated user: `site-newsite-com`
- Workspace: `/srv/webalive/sites/newsite.com/`
- Port: Auto-assigned from registry (3333-3999 range)
- Caddy configuration: Auto-updated with reverse proxy

**Architecture**: Shell-Operator Pattern
- **TypeScript**: Orchestration, error handling, state management
- **Bash**: OS operations, filesystem, permissions, systemd
- **Atomic scripts**: 7 deployment phases with automatic rollback
- **Concurrent safety**: File locking prevents race conditions

**Documentation**:
- Package: `packages/site-controller/README.md`
- Scripts: `packages/site-controller/scripts/*.sh`
- Architecture: `docs/architecture/README.md`

#### Updating Caddy Configuration

**Location**: `/root/webalive/claude-bridge/ops/caddy/Caddyfile`

```bash
# 1. Edit Caddyfile (add domain block)
nano /root/webalive/claude-bridge/ops/caddy/Caddyfile

# 2. Reload (zero-downtime, preserves active connections)
systemctl reload caddy

# 3. Verify
systemctl status caddy
```

**Auto-sync architecture**: Main `/etc/caddy/Caddyfile` imports the webalive Caddyfile via `import /root/webalive/claude-bridge/ops/caddy/Caddyfile`.

## Testing Guidelines

**Documentation**: See [docs/testing/TESTING_GUIDE.md](./docs/testing/TESTING_GUIDE.md) for complete testing guide.

### When to Write Tests (STRICT - MANDATORY)

**⚠️ IMPORTANT: Tests are NOT optional. You MUST write tests before considering any API work complete.**

**✅ MUST write tests for:**
1. **Security-critical functions** (100% coverage required)
   - Path traversal protection (`isPathWithinWorkspace`)
   - Session validation (`getSessionUser`, `hasSessionCookie`)
   - Workspace boundary checks (`getWorkspace`)
   - Shell command sanitization (if executing shell commands)
   - Authentication logic
   - **File operation endpoints** (Read, Write, Edit, Delete, etc.)

2. **New API routes** (MANDATORY - not optional!)
   - Any new endpoint in `app/api/`
   - **Minimum required tests:**
     - Authentication check (401 without session)
     - Happy path (successful operation)
     - At least one error case (400/403/404/500)
   - **For file operations, also test:**
     - Path traversal blocked
     - Protected files/dirs blocked (if applicable)
     - Workspace boundary enforced

3. **File operation endpoints** (CRITICAL - security boundary)
- These handle user data and filesystem access
- Must test all security checks work correctly
- Example: `/api/files/delete` has 15 tests covering auth, traversal, protected files

**⚠️ SHOULD write tests for:**
4. **Complex business logic**
   - Workspace resolution (multiple branches, edge cases)
   - Stream handling (if modifying SSE logic)
   - Credit/billing operations

**❌ DON'T write tests for:**
- Simple formatters/transforms
- Type guards (unless security-critical)
- UI components (unless fixing a bug)
- Third-party library wrappers
- Configuration files

### Quick Commands

```bash
# Run unit tests
cd apps/web && bun run test

# Run E2E tests (first time: bunx playwright install chromium)
bun run test:e2e

# Run specific test
bun run test security.test.ts
```

**Testing Notes:**
- Always use `bun run test`, never `bun test` directly
- Do NOT use `npx vitest` - npx and vitest don't work well together in this codebase

**E2E Test Best Practices** (see [postmortem](./docs/postmortems/2025-11-30-e2e-test-flakiness.md)):
- Tests should only wait for what they actually need (API tests don't need UI)
- Use `toBeAttached` instead of `toBeVisible` when you just need DOM presence
- Budget timeouts for parallel execution (4 workers = 2-3x slower)
- Avoid timeout accumulation: put longest wait first, then quick confirmations

### Test Patterns

**MUST READ**: [docs/testing/TEST_PATTERNS.md](./docs/testing/TEST_PATTERNS.md) - Do/Don't examples for AI-generated tests.

Key rules: No mocking internals, no `any` types, test real DB state, descriptive names, use test helpers, clean up data, test error paths.

### Local Development Setup

```bash
# 1. Install dependencies
bun install

# 2. Run setup script
bun run setup

# 3. Add .env.local (as shown by setup script)
# ANTHROPIC_API_KEY=your_key
# BRIDGE_ENV=local
# LOCAL_TEMPLATE_PATH=/path/to/.alive/template

# 4. Start dev server
bun run dev
```

**Test Credentials** (when `BRIDGE_ENV=local`):
- Email: `test@bridge.local`
- Password: `test`

### Before Committing

**Automated checks:**
- [ ] Tests pass: `bun run test && bun run test:e2e` (if you wrote tests)
- [ ] Format: `bun run format`
- [ ] Lint: `bun run lint`

**Manual verification (if applicable):**
- [ ] Tested security functions manually (path traversal, auth)
- [ ] Tested both standard domain mode and terminal mode
- [ ] Verified workspace isolation works
- [ ] No real Anthropic API calls in tests (check logs)

## Production Deployment

**⚠️ CRITICAL: Production deployment is intentionally restricted.** Contact devops for production deploys.

For troubleshooting, inspecting production, and dev/staging work, see `docs/deployment/deployment.md`.

### Available Commands

**Dev & Staging:**
```bash
make staging     # Full staging deployment (port 8998)
make dev         # Rebuild tools + restart dev server (port 8997)
make devchat     # Restart dev server via systemctl (safe from chat)
make logs-staging # View staging logs
make logs-dev    # View dev environment logs

# Status & monitoring
make status      # Show all environments
make rollback    # Interactive rollback (if needed)
```

### Deploying from Chat

See **Core Rules 12-14** at the top of this file. Summary: clean orphans, check `make deploy-status`, deploy with `nohup`.

### Site Deployment (Different)

To deploy individual websites (not the Claude Bridge itself), use the API endpoint:
```bash
# Via web UI at /deploy (recommended)
# Or via API:
curl -X POST https://terminal.goalive.nl/api/deploy-subdomain \
  -H "Content-Type: application/json" \
  -d '{"domain": "newsite.alive.best", "email": "user@example.com"}'
```

**Package**: Site deployments are handled by `@webalive/site-controller` with atomic bash scripts and automatic rollback.


## Key Dependencies & Versions

### Core Stack
- **Next.js**: 16.0.0 (App Router, RSC)
- **React**: 19.2.0 (Concurrent features)
- **Claude Agent SDK**: 0.1.60 (query, streaming, tools) - Note: 0.2.x available with breaking changes
- **Bun**: 1.2.22+ (runtime & package manager)
- **TypeScript**: 5.x (strict mode)
- **TailwindCSS**: 4.1.15 (utility-first CSS)

### Infrastructure Packages
- **@webalive/database**: Supabase schema types - `iam` schema (users, orgs, org_memberships, sessions), `app` schema (domains, user_quotas, feedback, templates)
- **@webalive/site-controller**: Site deployment orchestration (Shell-Operator Pattern)
- **@webalive/oauth-core**: Multi-tenant OAuth with AES-256-GCM encryption
- **@alive-brug/redis**: Redis client with automatic retry and error handling
- **@webalive/template**: Template for new site deployments

### Legacy (Deprecated)
- **@alive-brug/deploy-scripts**: Replaced by site-controller (no longer maintained)

## Common Issues & Solutions

### Issue: SSE Stream Buffering

**Symptom**: Messages don't appear in real-time

**Solution**: Ensure Next.js doesn't buffer SSE responses
```typescript
// In route.ts
return new Response(stream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'  // Disable nginx buffering
  }
})
```

### Issue: Path Traversal Vulnerability

**Symptom**: User can access files outside workspace

**Solution**: Always use `isPathWithinWorkspace()`
```typescript
const resolvedPath = path.resolve(workspacePath, userProvidedPath)
if (!isPathWithinWorkspace(resolvedPath, workspacePath)) {
  throw new Error('Invalid path')
}
```

### Issue: Session Not Persisting

**Symptom**: Conversation context lost on refresh

**Solution**: Check session key format and storage
```typescript
import { tabKey } from '@/features/auth/lib/sessionStore'
const key = tabKey({ userId, workspace, tabId })
const sessionId = await sessionStore.get(key)
```

### Issue: Systemd Site Not Starting

**Symptom**: `systemctl status site@domain.service` shows failed

**Solution**: Check logs and permissions
```bash
# View logs
journalctl -u site@domain-com.service -n 50

# Check file permissions
ls -la /srv/webalive/sites/domain.com/

# Verify user exists
id site-domain-com

# Test manual start
sudo -u site-domain-com bun /srv/webalive/sites/domain.com/user/index.ts
```

### Issue: Race Condition in Credit Charging

**Symptom**: Negative credit balances or billing leaks

**Cause**: Concurrent requests use read-modify-write pattern

**Solution**: Use atomic database operation (implemented in `atomic-credit-charging.md`)
```typescript
// ✅ Atomic deduction via RPC
const { data } = await iam.rpc('deduct_credits', {
  p_org_id: orgId,
  p_amount: credits
})
// Returns new balance or null if insufficient
```

**Documentation**: `docs/architecture/atomic-credit-charging.md`

### Template Sites Maintenance

**Template sites** are live sites used as deployment sources. They need `node_modules` to run their previews, but these MUST NOT be copied during deployment.

**Template sites** (in Supabase `app.templates`):
- `blank.alive.best` - Minimal starter
- `template1.alive.best` - Gallery template
- `four.goalive.nl` - Event template
- `one.goalive.nl` - SaaS template
- `loodgieter.alive.best` - Business template

**Key points:**
1. **rsync excludes** `node_modules` and `.bun` (see `02-setup-fs.sh`)
2. Template sites need their `node_modules` for previews to work
3. If template preview returns 502, reinstall deps and restart:
```bash
# For template with root package.json
cd /srv/webalive/sites/blank.alive.best
sudo -u site-blank-alive-best bun install
systemctl restart site@blank-alive-best.service

# For template with user/package.json
cd /srv/webalive/sites/four.goalive.nl/user
sudo -u site-four-goalive-nl bun install
systemctl restart site@four-goalive-nl.service
```

**IMPORTANT:** When updating `@alive-game/alive-tagger` or similar packages:
- Update both `vite.config.ts` AND `package.json` in all sites
- The `generate-config.js` script generates vite configs - keep it in sync

## Git Workflow

**Custom SSH Key**: Uses `alive_brug_deploy` for GitHub

```bash
# Push changes
bun run push

# Pull changes
bun run pull
```

## Documentation Structure

All documentation in `/docs` with clean, nested organization:

- **[docs/README.md](./docs/README.md)** - Documentation hub
- **[docs/GETTING_STARTED.md](./docs/GETTING_STARTED.md)** - Setup & quick start
- **[docs/architecture/](./docs/architecture/README.md)** - System design, patterns, core concepts
- **[docs/security/](./docs/security/README.md)** - Authentication, workspace isolation, security patterns
- **[docs/testing/](./docs/testing/README.md)** - Unit, integration, E2E testing
- **[docs/features/](./docs/features/README.md)** - Feature documentation
- **[docs/deployment/](./docs/deployment/README.md)** - Environment management (devops)
- **[docs/troubleshooting/](./docs/troubleshooting/README.md)** - Common issues, solutions
- **[docs/archive/](./docs/archive/)** - Historical documentation

## Local Open Source Services

**Location**: `/opt/services/`

Self-hosted open-source tools running on this server. Each service has its own directory with docker-compose or systemd configuration.

```
/opt/services/
├── mailcow/            # Self-hosted email server
└── supabase/           # Self-hosted Supabase instance
```

**Management**: Services typically run via Docker Compose or systemd. Check individual directories for their `docker-compose.yml` or service configuration.

## Automation System

We have a custom in-process automation scheduler (NOT n8n). Jobs are stored in Supabase `app.automation_jobs` and executed by the CronService.

**Key files:**
- `apps/web/lib/automation/cron-service.ts` - Main scheduler (setTimeout-based, wakes when next job is due)
- `apps/web/lib/automation/executor.ts` - Runs automation prompts via Claude
- `packages/automation/` - Cron expression parsing utilities

**How it works:**
1. Jobs stored in `app.automation_jobs` with cron schedule, prompt, and site reference
2. CronService runs in-process, wakes precisely when next job is due
3. Executor runs the prompt against the site's workspace using Claude
4. Results stored in `app.automation_runs`, status broadcast via SSE

**API endpoints:**
- `GET/POST /api/automations` - List/create automations
- `POST /api/automations/[id]/trigger` - Manually trigger a job
- `GET /api/automations/[id]/runs` - Get run history
- `GET /api/automations/events` - SSE stream for real-time status

**Debugging:**
```bash
# Check if cron service is running (look for "[CronService]" logs)
journalctl -u claude-bridge-staging | grep CronService | tail -20

# Check automation_jobs table
sqlite3 use_this_to_remember.db "SELECT 'Check app.automation_jobs in Supabase'"
```

## External Reference Repos

**Location**: `/opt/third/`

External codebases cloned for reference when stuck on frontend issues.

| Repo | Purpose |
|------|---------|
| `openaifrontend` | OpenAI-style chat frontend - use as reference for UI patterns, streaming, chat components |

**When to use**: If stuck on frontend issues (chat UI, streaming display, component patterns), check these repos for working examples before reinventing.

## Important Notes

1. **Never bypass security**: All file operations must be workspace-scoped
2. **Systemd for everything**: All processes managed by systemd
3. **User-based authentication**: Users have ONE account password that works across all their sites
4. **Session persistence**: Current in-memory store is NOT production-ready
5. **Terminal mode**: Allows custom workspace, verify before use
6. **Manager access**: Hidden `/manager` URL with separate authentication

## Questions or Unclear Requirements?

When working on this codebase:

1. **Check existing patterns** before introducing new approaches
2. **Security first** - if uncertain, ask user before proceeding
3. **Test both modes** - standard domain and terminal mode
4. **Document changes** - update relevant docs when adding features
5. **Use provided scripts** - don't reinvent deployment/management tools

## Contact & Support

For questions about this codebase, refer to:
- README.md for architecture overview
- Implementation docs for feature status
- Deployment scripts for infrastructure patterns