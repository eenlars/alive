# Architecture

Core system design, patterns, and technical concepts.

## Overview

Claude Bridge is a multi-tenant development platform enabling Claude AI to assist with website development through controlled file system access. Each domain gets isolated workspace sandboxing with security-first design.

**Key Principles:**
- Multi-tenant isolation (domain → workspace mapping)
- Security through workspace sandboxing + systemd process isolation
- Real-time streaming via Server-Sent Events (SSE)
- Tool-based interaction (limited to safe file operations)

## Core Concepts

| Topic | Description |
|-------|-------------|
| [Workspace Isolation](./workspace-isolation.md) | Multi-tenant workspace security, privilege separation, systemd isolation |
| [Message Handling](./message-handling.md) | SSE streaming, tool tracking, message grouping, rendering |
| [Session Management](./session-management.md) | Session persistence, conversation locking, resumption |
| [Credits & Tokens](./credits-and-tokens.md) | Credit system, LLM token conversion, model selection |
| [Atomic Credit Charging](./atomic-credit-charging.md) | Race condition fix, database RPC, concurrent safety |
| [Shell Server Config](./shell-server-config.md) | Environment-specific terminal configuration |
| [DNS Verification](./dns-verification.md) | CDN/proxy support, origin validation |
| [Deployment Architecture](../deployment/CURRENT_ARCHITECTURE.md) | Current site deployment flow (with known issues) |

## Request → Response Pipeline

```
Client POST /api/claude/stream
  ↓
Auth check (JWT session cookie)
  ↓
Workspace resolution (terminal.* vs domain-based)
  ↓
Conversation lock (prevent concurrent requests)
  ↓
Session resume lookup (restore context)
  ↓
Claude SDK query() with tool callbacks
  ↓
ReadableStream SSE (start → message* → session → complete/error)
  ↓
Client SSE parser
  ↓
toolUseMap building (track tool IDs → names)
  ↓
UIMessage[] accumulation
  ↓
groupMessages() batch by type
  ↓
renderMessage() component dispatch
  ↓
React UI
```

## Directory Structure

```
apps/web/
├── app/                      # Next.js App Router
│   ├── api/                 # API routes
│   │   ├── claude/         # Claude SDK integration (stream/polling)
│   │   ├── login/          # Authentication
│   │   └── tokens/         # Credit balance
│   ├── chat/               # Chat UI
│   └── workspace/          # Workspace selection (terminal mode)
│
├── features/                # Feature modules
│   ├── auth/               # Authentication & sessions
│   ├── chat/               # Chat components & logic
│   ├── workspace/          # Workspace resolution
│   └── deployment/         # Site deployment
│
├── lib/                     # Shared utilities
│   ├── claude/             # Claude SDK helpers
│   ├── security.ts         # Security utilities
│   ├── credits.ts          # Credit conversions
│   └── tokens.ts           # Token management
│
└── components/             # Reusable UI components
    └── ui/                 # Base UI components
```

## Tech Stack

### Core Stack
- **Next.js 16** - React framework (App Router)
- **React 19** - UI library (concurrent features)
- **Claude Agent SDK 0.1.60** - AI integration (query, streaming, tools)
- **Bun 1.2.22+** - Runtime & package manager
- **TypeScript 5.x** - Type safety (strict mode)
- **TailwindCSS 4** - Utility-first styling
- **Zustand** - State management (atomic selectors pattern)

### Infrastructure Packages

| Package | Purpose |
|---------|---------|
| [@webalive/site-controller](../../packages/site-controller/README.md) | Site deployment with Shell-Operator Pattern |
| [@webalive/oauth-core](../../packages/oauth-core/README.md) | Multi-tenant OAuth with AES-256-GCM encryption |
| [@alive-brug/redis](../../packages/redis/README.md) | Redis client with automatic retry |
| [@webalive/template](../../packages/template/README.md) | Template for new site deployments |
| [@webalive/guides](../../packages/guides/README.md) | Shared guide templates |
| [@webalive/images](../../packages/images/README.md) | Shared images and assets |

### Database
- **Supabase (PostgreSQL)** - Primary database with RLS
- **IAM Schema** - Users, orgs, sessions (`iam.*`)
- **App Schema** - Domains, sources, uploads (`app.*`)
- **Lockbox Schema** - Encrypted secrets (`lockbox.*`)

## Key Files Reference

| File | Purpose |
|------|---------|
| `app/api/claude/stream/route.ts` | SSE streaming endpoint, session locking, resume |
| `features/chat/lib/streamHandler.ts` | Client-side SSE parser |
| `features/chat/lib/message-parser.ts` | Tool tracking, UIMessage building |
| `features/chat/lib/message-grouper.ts` | Message batching (text vs thinking/tools) |
| `features/workspace/lib/workspace-secure.ts` | Workspace resolution & validation |
| `lib/claude/tool-permissions.ts` | Tool whitelisting, path validation |
| `lib/tokens.ts` | Credit storage, charging, balance |
| `lib/credits.ts` | LLM token ↔ credit conversion |
| `features/auth/lib/jwt.ts` | JWT session creation & validation |
| `features/auth/lib/auth.ts` | Authentication helpers |

## Design Patterns

### Workspace-Scoped Operations

All file operations are scoped to authenticated workspace:

```typescript
const workspace = getWorkspace(host)  // Resolve & validate
ensurePathWithinWorkspace(filePath, workspace.root)  // Boundary check
```

### Tool Permission Handler

SDK tools require explicit whitelisting + path validation:

```typescript
const canUseTool = createToolPermissionHandler(workspace, requestId)
// Checks: tool in whitelist? path within workspace?
```

### Child Process UID Switching

Systemd sites spawn SDK in child process with dropped privileges:

```typescript
// Automatic detection based on directory ownership
if (shouldUseChildProcess(workspace.root)) {
  // Spawn child that calls setegid/seteuid
  // All file ops inherit workspace user credentials
}
```

### Atomic Credit Operations

Prevent race conditions in concurrent credit charging:

```typescript
// ❌ BAD: Read-modify-write (race condition)
const balance = await getBalance()
await setBalance(balance - amount)

// ✅ GOOD: Atomic database operation
const { data } = await iam.rpc('deduct_credits', {
  p_org_id: orgId,
  p_amount: amount
})
// Returns new balance or null if insufficient
```

See [Atomic Credit Charging](./atomic-credit-charging.md) for complete analysis.

### Conversation Locking

Prevent concurrent requests to same conversation:

```typescript
const key = `${userId}::${workspace}::${conversationId}`
if (activeConversations.has(key)) return 409
activeConversations.add(key)
try { /* SDK query */ }
finally { activeConversations.delete(key) }
```

### Session Persistence

Resume conversations after browser close:

```typescript
const sessionKey = `${userId}::${workspace}::${conversationId}`
const sessionId = await sessionStore.get(sessionKey)
if (sessionId) {
  // Resume from session (skips tool re-execution)
}
```

## Current Deployment Architecture (As-Is)

**Status:** Functional but has known architectural issues being addressed in upcoming refactoring.

### High-Level Flow

```
User → API Route → TypeScript deploySite() → Infrastructure Deployed
                                                ↓
                                      registerDomain() → Supabase
                                                ↓
                                         Success or Failure
```

**Key Components:**

1. **API Layer** (`POST /api/deploy-subdomain`)
   - Receives email/password, slug, orgId
   - Validates session and org access
   - Calls deploySite() with email/password
   - Calls registerDomain() with email/password (AFTER infrastructure)
   - 30+ states documented in [REFACTORING_PROBLEM_STATEMENT.md](../deployment/REFACTORING_PROBLEM_STATEMENT.md)

2. **TypeScript Deploy Library** (`packages/deploy-scripts/src/orchestration/deploy.ts`)
   - Requires email parameter but never uses it
   - Assigns port, creates user, sets up workspace
   - Configures systemd, updates Caddy
   - 40+ states documented in problem statement

3. **Bash Script** (`scripts/sites/deploy-site-systemd.sh`)
   - NOT used by API (manual deployments only)
   - Self-contained: validates email, hashes password
   - 194 states across 6 phases (detailed in [site-deployment-state-machine.md](../deployment/site-deployment-state-machine.md))

### Known Architectural Issues

**⚠️ Critical Problem**: Infrastructure deployed BEFORE Supabase registration

If `registerDomain()` fails (wrong password, duplicate email, etc.):
- systemd service already running
- Port already consumed
- Linux user already created
- Files already copied
- **NO ROLLBACK MECHANISM**

See [../deployment/REFACTORING_PROBLEM_STATEMENT.md](../deployment/REFACTORING_PROBLEM_STATEMENT.md) for:
- Complete state machines (API, TypeScript, Bash)
- Database schema (Supabase IAM + App)
- Port registry format
- Detailed problem analysis
- 6 major pain points
- Solution space exploration

### State Machines

Three complete state machine diagrams available:

1. **API Route**: 30+ states ([REFACTORING_PROBLEM_STATEMENT.md](../deployment/REFACTORING_PROBLEM_STATEMENT.md#system-1-api-route-post-apideploy-subdomain))
2. **TypeScript Library**: 40+ states ([REFACTORING_PROBLEM_STATEMENT.md](../deployment/REFACTORING_PROBLEM_STATEMENT.md#system-2-typescript-deploy-library-deploysite))
3. **Bash Script**: 194 states, 6 phases ([site-deployment-state-machine.md](../deployment/site-deployment-state-machine.md))

## See Also

- [Security Guide](../security/README.md) - Authentication, workspace enforcement
- [Testing Guide](../testing/README.md) - How to test architecture components
- [Features](../features/README.md) - Feature implementations
- [Deployment](../deployment/README.md) - Deployment architecture and known issues
- [CURRENT_ARCHITECTURE.md](../deployment/CURRENT_ARCHITECTURE.md) - As-is deployment flow
