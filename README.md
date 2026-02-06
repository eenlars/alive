# Alive

AI-powered website development. Claude edits your files directly, in isolated sandboxes.

**[Documentation](./docs/README.md)** · **[Architecture](./docs/architecture/README.md)** · **[Security](./docs/security/README.md)**

---

## What is this?

Alive gives Claude AI controlled access to your website files. Each site gets its own isolated workspace where Claude can read, write, and edit files safely.

```
You: "Update the hero section to be more engaging"
Claude: [reads your code, makes changes, explains what it did]
```

---

## 🚀 Quickstart

### 1. Install dependencies

```bash
bun install
```

### 2. Set up environment

```bash
bun run setup
```

### 3. Add your API key

Create `apps/web/.env.local`:
```bash
ANTHROPIC_API_KEY=your_key
ALIVE_ENV=local
```

### 4. Start the server

```bash
bun run dev
```

### 5. Open the app

Visit `http://localhost:8997` and log in:
- **Email**: `test@alive.local`
- **Password**: `test`

---

## 🏗️ How It Works

```
Browser → Alive → Claude SDK → Your Files
              ↓
    Workspace Sandbox
    /srv/webalive/sites/[domain]/
```

**Key concepts:**
- **Workspaces** - Each domain gets isolated file access
- **Tool restrictions** - Claude can only Read, Write, Edit, Glob, Grep
- **Path validation** - No escaping the sandbox
- **Systemd isolation** - Each site runs as its own user

---

## 📁 Project Structure

```
apps/
├── web/              # Main Next.js app (chat UI, Claude API, auth)
├── broker/           # Message broker for streaming
└── shell-server-go/  # Web terminal + file editor (Go)

packages/
├── tools/            # Claude's workspace tools
├── database/         # Supabase types & schema
├── site-controller/  # Site deployment orchestration
└── shared/           # Constants, env definitions
```

---

## 🛠️ Development

```bash
bun run dev           # Start dev server
bun run test          # Run unit tests
bun run format        # Format code
bun run lint          # Lint code
```

### Deployment

```bash
make staging          # Deploy to staging
make dev              # Rebuild dev environment
make logs-staging     # View staging logs
```

---

## 🔐 Security

- **Sandbox isolation** - Claude can't access files outside workspace
- **Path traversal protection** - Directory escape attacks blocked
- **Tool whitelisting** - Only safe file operations allowed
- **Systemd users** - Sites run as dedicated unprivileged users

See [Security Documentation](./docs/security/README.md) for details.

---

## 📚 More Documentation

| Topic | Link |
|-------|------|
| Getting Started | [docs/GETTING_STARTED.md](./docs/GETTING_STARTED.md) |
| Architecture | [docs/architecture/README.md](./docs/architecture/README.md) |
| Testing Guide | [docs/testing/TESTING_GUIDE.md](./docs/testing/TESTING_GUIDE.md) |
| Database Setup | [docs/database/SETUP.md](./docs/database/SETUP.md) |
| Deployment | [docs/deployment/deployment.md](./docs/deployment/deployment.md) |

---

## 🔧 Environment Variables

**Required:**
```bash
ANTHROPIC_API_KEY=your_claude_api_key
```

**For production:**
```bash
DATABASE_URL=postgresql://...
JWT_SECRET=your-jwt-secret-min-32-chars
LOCKBOX_MASTER_KEY=your-32-byte-hex-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

See [Environment Setup](./docs/GETTING_STARTED.md#environment-variables) for full list.

---

## Tech Stack

- **Next.js 16** + **React 19** (App Router)
- **Claude Agent SDK** (AI integration)
- **Bun** (runtime & package manager)
- **TailwindCSS 4** (styling)
- **Supabase** (database)
- **Caddy** (reverse proxy)
- **systemd** (process management)
