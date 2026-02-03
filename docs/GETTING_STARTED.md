# Getting Started

The fastest way to set up Claude Bridge.

---

## Quick Start (Claude Code)

If you have [Claude Code](https://claude.ai/claude-code) installed:

```bash
git clone <repository>
cd claude-bridge
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

## Manual Setup

### Prerequisites

- **Bun** 1.2.22+ (`curl -fsSL https://bun.sh/install | bash`)
- **Anthropic API Key** ([console.anthropic.com](https://console.anthropic.com))

### 1. Clone & Install

```bash
git clone <repository>
cd claude-bridge
bun install
```

### 2. Create Local Workspace

```bash
bun run setup
```

### 3. Configure Environment

Create `apps/web/.env.local`:

```bash
BRIDGE_ENV=local
LOCAL_TEMPLATE_PATH=/your/path/to/claude-bridge/.alive/template
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

- **Email**: `test@bridge.local`
- **Password**: `test`

---

## What You Get

| Component | Description |
|-----------|-------------|
| Chat Interface | Talk to Claude with file access |
| Local Workspace | `.alive/template/` - your sandbox |
| Test User | `test@bridge.local` / `test` |
| Hot Reload | Changes reflect immediately |

---

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

Ensure `BRIDGE_ENV=local` is set in `apps/web/.env.local`.
