# Getting Started

The fastest way to set up Claude Bridge.

---

## Quick Start (Claude Code)

If you have [Claude Code](https://claude.ai/claude-code) installed:

```bash
git clone <repository>
cd alive
claude
```

Then tell Claude:

> Set me up for local development. Follow the instructions in `scripts/setup/SETUP_INSTRUCTIONS.md`

Claude will:
1. Install dependencies
2. Create your local workspace
3. Configure your environment
4. Start the dev server

---

## Choose Your Mode

| Mode | Dependencies | Use Case |
|------|--------------|----------|
| **Standalone** | None (just Anthropic API) | Quick local testing, no persistence |
| **Local** | Supabase, Redis | Full-featured local development |

---

## Standalone Mode (Recommended for Getting Started)

The fastest way to run Claude Bridge locally - no external services required.

### 1. Clone & Install

```bash
git clone <repository>
cd alive
bun install
```

### 2. Run Standalone Setup

```bash
bun run setup:standalone
```

This creates:
- `~/.claude-bridge/workspaces/default/user` - Your local workspace
- `apps/web/.env.local` - Pre-configured environment

### 3. Add Your API Key

Edit `apps/web/.env.local` and add your Anthropic API key:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

### 4. Start Development Server

```bash
bun run dev
```

### 5. Login

- Open `http://localhost:8999`
- Login with **any email/password** (auto-authenticated in standalone mode)

### Creating Additional Workspaces

```bash
mkdir -p ~/.claude-bridge/workspaces/my-project/user
```

### Standalone Mode Limitations

- Single user only (no authentication)
- No conversation history persistence (in-memory, lost on restart)
- No OAuth integrations (Linear, Stripe, etc.)
- No site deployment (systemd, Caddy)

---

## Local Mode (Full Features)

For full-featured development with persistence and all integrations.

### Prerequisites

- **Bun** 1.2.22+ (`curl -fsSL https://bun.sh/install | bash`)
- **Anthropic API Key** ([console.anthropic.com](https://console.anthropic.com))

### 1. Clone & Install

```bash
git clone <repository>
cd alive
bun install
```

### 2. Create Local Workspace

```bash
bun run setup
```

### 3. Configure Environment

Create `apps/web/.env.local`:

```bash
ALIVE_ENV=local
LOCAL_TEMPLATE_PATH=/your/path/to/alive/.alive/template
ANTH_API_SECRET=sk-ant-your-key-here
```

Get the correct path:
```bash
echo "$(pwd)/.alive/template"
```

### 4. Start Dev Server

```bash
bun run web
```

### 5. Login

Open `http://localhost:8999`

- **Email**: `test@alive.local`
- **Password**: `test`

---

## What You Get

| Component | Description |
|-----------|-------------|
| Chat Interface | Talk to Claude with file access |
| Local Workspace | `.alive/template/` - your sandbox |
| Test User | `test@alive.local` / `test` |
| Hot Reload | Changes reflect immediately |

<<<<<<< HEAD
---
=======
### Standalone Mode

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `BRIDGE_ENV` | Yes | Set to standalone | `standalone` |
| `ANTHROPIC_API_KEY` | Yes | Claude API key | `sk-ant-...` |
| `WORKSPACE_BASE` | No | Custom workspace directory | `~/.claude-bridge/workspaces` |

### Local Mode

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `BRIDGE_ENV` | Yes | Enable local dev mode | `local` |
| `LOCAL_TEMPLATE_PATH` | Yes | Absolute path to workspace | `/Users/you/claude-bridge/.alive/template` |
| `ANTHROPIC_API_KEY` | Yes | Claude API key | `sk-ant-...` |
| `BRIDGE_PASSCODE` | No | Bridge passcode (any works if unset) | `your-password` |
>>>>>>> 426f8ace (Fix standalone mode review issues)

## Common Commands

```bash
bun run web          # Start web dev server
bun run dev          # Full dev environment
bun run test         # Run unit tests
bun run format       # Format code
bun run lint         # Lint code
bun run setup        # Reset workspace
```

---

## Need More?

- **Database Setup**: [`docs/database/SETUP.md`](./database/SETUP.md) - Full user accounts, credits
- **Architecture**: [`docs/architecture/README.md`](./architecture/README.md) - How it works
- **Security**: [`docs/security/README.md`](./security/README.md) - Security model
- **Testing**: [`docs/testing/README.md`](./testing/README.md) - Writing tests
- **AI Guidelines**: [`CLAUDE.md`](../CLAUDE.md) - For Claude Code users

---

## Troubleshooting

### "LOCAL_TEMPLATE_PATH must be an absolute path"

Use full path starting with `/`:
```bash
LOCAL_TEMPLATE_PATH=$(pwd)/.alive/template
```

### "Local template workspace does not exist"

```bash
bun run setup
```

### "Port 8999 in use"

```bash
lsof -i :8999 | awk 'NR>1 {print $2}' | xargs kill -9
```

### "Test credentials don't work"

Ensure `ALIVE_ENV=local` is set in `apps/web/.env.local`.
