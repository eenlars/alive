# Claude Bridge - Multi-Tenant Development Platform

A multi-tenant web development platform that provides Claude AI assistance with controlled file system access for building and maintaining multiple websites.

## Overview

Claude Bridge enables developers to interact with Claude AI in the context of specific website projects, with each domain getting its own isolated workspace where Claude can read, write, and edit files safely.

**📚 [Documentation →](./docs/README.md)** | **🚀 [Quick Start](./docs/GETTING_STARTED.md)** | **🏗️ [Architecture](./docs/architecture/README.md)** | **🔐 [Security](./docs/security/README.md)** | **🧪 [Testing](./docs/testing/README.md)**

<!-- TODO: Download and host architecture diagram locally in docs/images/ to avoid external URL dependency -->
![Claude Bridge Architecture Whiteboard](https://terminal.goalive.nl/_images/t/larss.alive.best/o/98ba3d55db2b679a/v/orig.webp)

## Architecture

### Multi-Tenant Design
- **Domain-based workspaces**: Each hostname automatically maps to its own workspace
- **Isolated environments**: Sites are sandboxed in separate directories
- **Custom workspace selection**: Terminal mode allows manual workspace specification

### Workspace Structure
```
# Secure isolated location (new sites)
/srv/webalive/sites/
├── example.com/       # Owned by site-example-com user
│   └── user/          # Application files
└── demo.site.com/     # Owned by site-demo-site-com user
    └── user/          # Application files

```

## Features

### 🤖 Claude AI Integration
- **File Operations**: Read, write, edit, search files within workspace
- **Real-time Streaming**: Server-Sent Events (SSE) with live updates of Claude's actions
- **Conversation Context**: Maintains context across file operations with session resumption
- **Session Persistence**: Workspace-scoped conversation persistence - resume conversations after browser close
- **Tool Restrictions**: Limited to safe file operations (Read, Write, Edit, Glob, Grep) + approved MCP tools
- **Tool Tracking**: Advanced toolUseMap pattern for tracking tool invocations and results
- **Conversation Locking**: Prevents concurrent requests for same conversation
- **Automatic File Ownership**: Child process UID switching for systemd sites ensures proper file permissions
- **Model Selection**: Credit users → DEFAULT_MODEL enforced; API key users → choose model (see [docs/architecture/CREDITS_AND_TOKENS.md](./docs/architecture/CREDITS_AND_TOKENS.md))

### 🔐 Security & Access Control
- **JWT Authentication**: Secure 30-day JWT tokens in httpOnly cookies
- **Workspace Sandboxing**: Claude cannot access files outside designated workspace
- **Path Traversal Protection**: Prevents directory escape attacks with path normalization
- **Tool Whitelisting**: Explicit whitelist for SDK and MCP tools
- **Systemd Isolation**: Sites run as dedicated unprivileged users with OS-level filesystem protection
- **Child Process Security**: Automatic UID/GID switching for systemd sites
- **Session Management**: Cookie-based authentication with workspace-scoped permissions

### 🌐 Multi-Mode Access

#### Standard Mode (`example.com`)
- Automatic workspace: `/claude-bridge/sites/example.com/src`
- Immediate Claude access for domain-specific development

#### Terminal Mode (`terminal.example.com`)
- Custom workspace selection under `webalive/sites/`
- Workspace verification before Claude access
- Advanced development scenarios

### 📁 File Management
- **Directory Browser**: Explore workspace file structure
- **File Operations API**: Programmatic access to workspace files
- **Workspace Verification**: Ensures directories exist before access

## Installation & Setup

### Prerequisites
- Node.js 18+
- Bun package manager (1.2.22+)
- systemd (for process management and secure site isolation)
- Caddy (for reverse proxy)
- Biome (for code formatting and linting)

### Environment Variables
```bash
# Required
ANTHROPIC_API_KEY=your_claude_api_key
DATABASE_URL=postgresql://user:password@localhost:5432/claude_bridge
JWT_SECRET=your-jwt-secret-min-32-chars
LOCKBOX_MASTER_KEY=your-32-byte-hex-key  # Generate: openssl rand -hex 32

# Supabase (if using Supabase)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional
BRIDGE_PASSCODE=your_manager_passcode  # For /manager admin panel access only
CLAUDE_MODEL=<model-id>  # Default model for API key users
WORKSPACE_BASE=/srv/webalive/sites       # Base directory for workspaces (default: /srv/webalive/sites)

# Auto-deployment (optional)
GITHUB_WEBHOOK_SECRET=your_webhook_secret  # For GitHub webhook security (run: bun run setup-webhook)
DEPLOY_BRANCH=main                         # Only deploy on this branch (default: main)

# Local development (requires both)
BRIDGE_ENV=local                        # Enables local template mode + test user (test/test)
LOCAL_TEMPLATE_PATH=.alive/template     # Relative workspace path to template
```

### Database Setup

Claude Bridge uses PostgreSQL with multiple schemas for multi-tenant isolation. You can use **Supabase** (recommended) or **self-hosted PostgreSQL**.

```
┌─────────────────────────────────────────────────────────────┐
│                      PostgreSQL                             │
│  ┌─────────┐  ┌─────────┐  ┌──────────────┐  ┌───────────┐ │
│  │   iam   │  │   app   │  │ integrations │  │  lockbox  │ │
│  │─────────│  │─────────│  │──────────────│  │───────────│ │
│  │ users   │  │ domains │  │ providers    │  │ secrets   │ │
│  │ orgs    │  │ convos  │  │ tokens       │  │ keys      │ │
│  │ sessions│  │ messages│  │ policies     │  │           │ │
│  └─────────┘  └─────────┘  └──────────────┘  └───────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Quick Setup:**

```bash
# 1. Set your database connection
export DATABASE_URL="postgresql://user:pass@localhost:5432/claude_bridge"

# 2. Run interactive setup
cd packages/database
bun run db:setup

# 3. Apply schema
bun run db:push

# 4. Seed initial data (templates, providers)
psql $DATABASE_URL < seed/initial.sql
```

**For detailed instructions:** See [`docs/database/SETUP.md`](./docs/database/SETUP.md)

**Database Package:** The schema is defined as code using [Drizzle ORM](https://orm.drizzle.team/) in [`packages/database`](./packages/database/README.md). This enables:
- Type-safe database queries
- Automatic migration generation
- Works with any PostgreSQL (Supabase, self-hosted, Docker)

### Local Development Login
When `BRIDGE_ENV=local` is set, you can use the test credentials:
- **Email**: `test@bridge.local`
- **Password**: `test`

### Development

#### Local Setup (First Time)
```bash
# Install dependencies
bun install

# Set up local development workspace
bun run setup

# Add environment variables to apps/web/.env.local
# (The setup script will show you the exact values)
```

#### Git Hooks Setup (Important for GUI Git Clients)

This project uses Husky for Git hooks. If you use a **GUI Git client** (SourceTree, Tower, VS Code Git, GitHub Desktop), you need to configure your environment once:

```bash
# Create Husky config directory
mkdir -p ~/.config/husky

# Add Bun to PATH for Git hooks
echo 'export PATH="$HOME/.bun/bin:$PATH"' > ~/.config/husky/init.sh
```

**Why?** GUI Git clients don't load your shell configuration (`.zshrc`, `.bashrc`), so hooks can't find `bun` without this setup. Command-line Git users don't need this step.

**What runs automatically:**
- **Pre-commit**: Formats only the files you're committing (instant with lint-staged)
- **Pre-push**: Runs type-check, lint, format, and unit tests before allowing push

**To bypass hooks** (not recommended):
```bash
git commit --no-verify
git push --no-verify
```

#### Start Development Server
```bash
# Start development server
bun run dev
# or
bun run web
```

See [docs/setup/README.md](./docs/setup/README.md) for detailed local development setup instructions.

### Production Deployment

⚠️ **Production deployment is intentionally restricted.** Contact devops for production deploys.

#### Development & Staging

```bash
# Staging deployment
make staging

# Dev environment rebuild
make dev

# View logs
make logs-staging
make logs-dev
```

See `docs/deployment/deployment.md` for detailed deployment and troubleshooting documentation.

#### Caddy Configuration & Domain Routing

**🔒 Secure Site Deployment (ONLY WAY):**
```bash
# Deploy with systemd isolation (TypeScript sitectl)
bun run deploy-site newsite.com

# Or directly:
export DEPLOY_EMAIL="user@example.com"
bun run packages/deploy-scripts/src/sitectl.ts newsite.com

# Result: systemd service with dedicated user and security hardening
# Account is created or linked in Supabase (email-based authentication)
```

**Manual Caddy Setup (if needed):**
```bash
# 1. Add to /root/webalive/claude-bridge/Caddyfile
newsite.com {
    reverse_proxy localhost:3338
}

# 2. Reload (zero-downtime)
systemctl reload caddy
```

**Architecture:**
- **Main** (`/etc/caddy/Caddyfile`): System config + `import /root/webalive/claude-bridge/Caddyfile`
- **Sites** (`/root/webalive/claude-bridge/Caddyfile`): Domain→port mappings
- **Auto-sync**: Changes applied instantly via import, no file copying
- **Validation**: `caddy validate --config /etc/caddy/Caddyfile`

**Deployment Tool:**
- **Secure (Recommended)**: `packages/deploy-scripts/src/sitectl.ts` (TypeScript, systemd isolation)

## Usage Examples

### Standard Domain Access
1. Visit `https://yoursite.com`
2. Log in with your account (email + password)
3. Start chatting with Claude about your site
4. Claude can read/edit files in `/srv/webalive/sites/yoursite.com/`

### Terminal Mode Access
1. Visit `https://terminal.goalive.nl`
2. Log in with your account
3. Select your workspace from the list
4. Claude can work in the selected workspace directory

### Claude Capabilities
```
You: "Read the package.json file and update the version"
Claude: [reads file, analyzes, makes changes]

You: "Find all TODO comments in the codebase"
Claude: [searches with Grep, provides list]

You: "Create a new React component for user authentication"
Claude: [writes new file, follows project conventions]
```

## API Endpoints

### Authentication
- `POST /api/login` - Authenticate with email + password, sets JWT session cookie
- `POST /api/logout` - Clear session cookies
- `GET /api/manager` - List domain configurations (requires manager passcode)
- `POST /api/manager` - Update domain configurations (requires manager passcode)

### Claude Integration

#### `POST /api/claude/stream` (Streaming SSE)
Real-time streaming endpoint with Server-Sent Events.

**Headers**: `Content-Type: text/event-stream, Cache-Control: no-cache, Connection: keep-alive`

**Request Body**:
```json
{
  "message": "What does this file do?",
  "conversationId": "550e8400-e29b-41d4-a716-446655440000",
  "workspace": "webalive/sites/demo"  // optional; required for terminal mode
}
```

**Response**: SSE stream with events:
- `start` - Conversation initialization
- `message` - Each Claude SDK message
- `session` - Session ID for resumption
- `complete` - Final completion summary
- `error` - Error information

**Status Codes**:
- 200 OK – Stream begins
- 401 Unauthorized – No session cookie
- 409 Conflict – Conversation already in progress (locked)
- 400 Bad Request – Invalid workspace or missing required fields
- 500 Internal Server Error – SDK query failed

#### `POST /api/claude` (Polling)
Non-streaming endpoint returning full response as JSON.

**Request Body**: Same as streaming endpoint

**Response**:
```json
{
  "ok": true,
  "host": "localhost",
  "cwd": "/path/to/workspace",
  "result": { /* SDKResultMessage */ },
  "requestId": "abc123"
}
```

### File Operations
- `POST /api/files` - Browse workspace directory
- `POST /api/verify` - Verify workspace exists and is readable

### Deployment Webhooks
- `POST /api/webhook/deploy` - GitHub webhook receiver for auto-deployment
  - **Authentication**: HMAC SHA-256 signature verification
  - **Headers**: `x-github-event`, `x-hub-signature-256`
  - **Events**: Push events on configured branch (default: main)
  - **Response**: Immediate (deployment runs in background)
  - **Logs**: Stored in `logs/deploy-TIMESTAMP.log`
- `GET /api/webhook/deploy` - Check webhook status and recent deployments
- `GET /api/webhook/deploy/logs/[filename]` - View specific deployment log

## Security Features

### Workspace Isolation
- Claude operations restricted to designated workspace
- Path validation prevents directory traversal
- No access to system files or other sites

### Authentication
- **Supabase-based**: Email + password authentication with bcrypt hashing
- **JWT Sessions**: 30-day tokens with userId in httpOnly cookies
- **Organization-based**: Workspace access determined via org memberships
- **Domain Manager**: Hidden access via `/manager` URL (requires BRIDGE_PASSCODE)
- **Separate Sessions**: Manager uses `manager_session` cookie, isolated from user sessions
- **Local Development**: `BRIDGE_ENV=local` enables test user (email: "test@bridge.local", password: "test")

### Tool Restrictions
- **SDK Tools**: Read, Write, Edit, Glob, Grep (with path validation)
- **MCP Tools**: Workspace management (restart dev server, install packages), tools guides, persona generation
- **No Shell Access**: Bash and other dangerous tools blocked
- **Path Validation**: All file operations validated against workspace boundaries
- **Audit Logging**: All tool usage logged with request IDs

## Testing

```bash
# Run unit tests
cd apps/web && bun run test

# Run E2E tests (requires setup)
bun run test:e2e

# Run with coverage
cd apps/web && bun run test --coverage
```

**Testing Notes:**
- Always use `bun run test`, never `bun test` directly
- Do NOT use `npx vitest` - npx and vitest don't work well together in this codebase

**First time setup for E2E tests:**
```bash
bunx playwright install chromium
bun run setup
```

See [Testing Guide](./docs/testing/TESTING_GUIDE.md) for detailed testing instructions, examples, and best practices.

## Development Scripts

```bash
# Development
bun run dev          # Start dev server with Turbo
bun run web          # Start web app only
bun run widget       # Start widget server (Go-based)

# Testing
bun run test         # Run unit tests (from apps/web)
bun run test:e2e     # Run E2E tests

# Deployment (Dev & Staging via Makefile)
make dev             # Rebuild and restart dev environment
make staging         # Full staging deployment
make logs-dev        # View dev logs
make logs-staging    # View staging logs

# Site Deployment
bun run deploy-site  # Deploy new site with systemd isolation

# Code Quality
bun run format       # Format code with Biome
bun run lint         # Lint code with Biome

# CORS & Infrastructure
bun run update-cors  # Update CORS domains configuration

# Git Operations (with custom SSH key)
bun run push         # Push with alive_brug_deploy SSH key
bun run pull         # Pull with alive_brug_deploy SSH key
```

## Directory Structure

```
claude-bridge/
├── README.md                 # This file - project overview
├── CLAUDE.md                 # Developer guide for AI assistants
├── DOCUMENTATION.md          # Complete documentation index
├── IMPLEMENTATION_SUMMARY.md # Feature completion tracking
├── apps/web/                 # Next.js application
│   ├── app/
│   │   ├── api/              # API routes
│   │   │   ├── claude/       # Claude integration
│   │   │   ├── files/        # File operations
│   │   │   ├── login/        # Authentication
│   │   │   └── verify/       # Workspace verification
│   │   ├── chat/             # Chat interface
│   │   ├── workspace/        # Workspace selection
│   │   └── globals.css       # Global styles
│   ├── components/           # React components
│   ├── lib/                  # Utility libraries
│   │   ├── stores/           # Zustand state management
│   │   └── claude/           # Claude SDK helpers
│   ├── features/             # Feature-specific code
│   │   ├── chat/             # Chat components and logic
│   │   ├── auth/             # Authentication
│   │   └── workspace/        # Workspace management
│   ├── dist → dist.TIMESTAMP # Symlink to active build (gitignored)
│   ├── dist.20251105-155847/ # Timestamped build (gitignored)
│   └── package.json
├── scripts/                  # Infrastructure scripts
│   ├── build-atomic.sh       # Atomic build with symlinks
│   ├── build-and-serve.sh    # Full deployment script
│   └── sites/                # Site management (legacy)
├── docs/                     # Documentation
│   ├── architecture/         # System architecture
│   ├── deployment/           # Deployment guides
│   ├── testing/              # Testing documentation
│   ├── security/             # Security documentation
│   ├── guides/               # How-to guides
│   ├── features/             # Feature documentation
│   └── sessions/             # Session management
├── packages/                 # Workspace packages
│   ├── database/             # Database schema (Drizzle ORM)
│   │   ├── src/schema/       # TypeScript schema definitions
│   │   ├── migrations/       # SQL migrations
│   │   └── seed/             # Initial seed data
│   ├── template/             # Site template
│   ├── tools/                # Tool definitions for Claude
│   ├── site-controller/      # Site deployment orchestration
│   └── images/               # Image handling utilities
├── Caddyfile                 # Reverse proxy config
└── package.json              # Monorepo configuration
```

## Enhanced Architecture Features

### Streaming & SSE Protocol

The platform uses Server-Sent Events (SSE) for real-time streaming of Claude's responses:

**Event Schema:**
```json
{
  "type": "start|message|session|complete|error",
  "requestId": "abc123",
  "timestamp": "2025-10-28T14:00:00Z",
  "data": { /* event-specific payload */ }
}
```

**Event Lifecycle:**
1. **start** – `{ host, cwd, message, messageLength, isResume }`
2. **message** – For each SDK message: `{ messageCount, messageType, content: SDKMessage }`
3. **session** – `{ sessionId }` (extracted from system:init, persisted to SessionStore)
4. **complete** – `{ totalMessages, result: SDKResultMessage | null }`
5. **error** – `{ error, message, details, stack }`

### Tool Tracking & Result Rendering

**toolUseMap Pattern:**
- Global `Map<tool_use_id, tool_name>` tracks tool invocations
- Assistant messages with `tool_use` blocks populate the map
- User messages with `tool_result` blocks lookup tool names for proper rendering
- Enables flexible message interleaving and component dispatch

### Session Management & Concurrency

**Conversation Locking:**
- `Set<conversationKey>` prevents concurrent requests for same conversation
- Lock acquired before SDK query, released in finally block
- Returns 409 Conflict if conversation already in progress

**Session Persistence:**
- SessionStore interface with get/set/delete operations
- Key format: `${userId}::${workspace}::${conversationId}`
- Supports conversation resumption across browser sessions
- Default in-memory implementation (Redis/DB recommended for production)

### Message Grouping Strategy

Messages are batched into groups for optimal UI rendering:
- **Text messages** (user + assistant-text-only) → separate groups
- **Thinking/tool messages** → accumulated into groups until completion
- `isComplete` flag drives loading states and UI finalization

## Key Dependencies

- **Next.js 16.0.0** – React framework with App Router
- **React 19.2.0** – Latest React with concurrent features
- **@anthropic-ai/claude-agent-sdk 0.1.60** – Claude integration (query, streaming, tool callbacks)
- **TailwindCSS 4.1.15** – Utility-first CSS framework
- **Lucide React 0.546.0** – Modern icon library
- **Zod 4.1.12** – TypeScript-first schema validation
- **Groq SDK 0.34.0** – Alternative AI model integration
- **React Hot Toast 2.6.0** – Toast notifications
- **React Markdown 10.1.0** – Markdown rendering with GFM support

## Production Checklist

### Application Security ✅
- [x] Implement JWT session tokens with expiry (30-day tokens)
- [x] Set proper cookie flags (httpOnly, Secure, SameSite)
- [x] Validate workspace boundary enforcement with adversarial paths
- [x] Log all tool invocations for audit trail
- [x] Tool whitelisting implemented (SDK + MCP)
- [x] Path traversal protection with normalization
- [x] Systemd isolation for new sites
- [ ] Replace in-memory SessionStore with Redis/database (currently in-memory)
- [ ] Add logout endpoint (client-side cookie clearing exists)
- [ ] Add rate limiting on authentication and streaming endpoints

### Performance & Monitoring
- [x] Request tracing with requestId propagation
- [x] Implement health checks (atomic build system)
- [ ] Monitor SessionStore memory usage and concurrent conversation limits
- [ ] Set up error tracking and alerting (Sentry/similar)
- [ ] Configure proper logging levels for production

### Infrastructure ✅
- [x] Configure Caddy reverse proxy with HTTPS/TLS (auto-HTTPS enabled)
- [x] Set up systemd process manager for high availability
- [x] Validate all required environment variables
- [x] Test domain routing for both standard and terminal modes
- [x] Atomic build system with rollback capability
- [x] GitHub webhook auto-deployment
- [ ] Implement backup and recovery procedures for session data

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes following existing code style (use `bun run format` and `bun run lint`)
4. Test with both standard and terminal modes
5. Ensure all environment variables are documented
6. Update relevant documentation
7. Submit a pull request

## License

[Add your license here]