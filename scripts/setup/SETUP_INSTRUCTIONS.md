# Alive Setup Instructions

**For Claude Code**: Follow these steps to set up Alive for a new developer.

---

## Pre-Flight Checks

Run these checks first:

```bash
# Check bun is installed
bun --version

# Check we're in the right directory
test -f package.json && grep -q "alive-mono" package.json && echo "OK: In alive root"

# Check if already set up
test -f apps/web/.env.local && echo "NOTICE: .env.local exists"
test -d .alive/template && echo "NOTICE: Template already exists"
```

---

## Step 1: Install Dependencies

```bash
bun install
```

This also runs `postinstall` which:
- Installs template dependencies (`templates/site-template/user`)
- Builds all packages

---

## Step 2: Create Local Workspace

```bash
bun run setup
```

This creates `.alive/template/` - your local test workspace (gitignored).

---

## Step 3: Create Environment File

Create `apps/web/.env.local` with these **required** values:

```bash
# REQUIRED for local development
ALIVE_ENV=local
LOCAL_TEMPLATE_PATH=/absolute/path/to/alive/.alive/template

# OPTIONAL - only needed for Claude chat API calls
# App boot + local workspace flows work without this.
# If using Claude Code CLI, this is often already set as ANTHROPIC_API_KEY.
ANTH_API_SECRET=sk-ant-...

# REQUIRED in production (optional locally)
JWT_SECRET=generate-with-openssl-rand-base64-32

# OPTIONAL - superadmin access (your email for full access)
SUPERADMIN_EMAILS=your-email@example.com
```

**To generate JWT_SECRET:**
```bash
openssl rand -base64 32
```

**To find the correct LOCAL_TEMPLATE_PATH:**
```bash
echo "$(pwd)/.alive/template"
```

---

## Step 4: Verify Setup

```bash
# Check environment file exists and has core local-dev vars
grep -E "^ALIVE_ENV=|^LOCAL_TEMPLATE_PATH=" apps/web/.env.local

# Check template workspace exists
ls -la .alive/template/
```

---

## Step 5: Start Development Server

```bash
bun run web
```

Server starts at `http://localhost:8997`

---

## Step 6: Test Login

Open `http://localhost:8997` and log in with:
- **Email**: `test@alive.local`
- **Password**: `test`

These test credentials only work when `ALIVE_ENV=local`.

---

## Troubleshooting

### "LOCAL_TEMPLATE_PATH must be an absolute path"

The path must start with `/`. Use:
```bash
echo "$(pwd)/.alive/template"
```

### "Local template workspace does not exist"

Run `bun run setup` to create it.

### "ANTHROPIC_API_KEY not set"

Only Claude chat requests need an Anthropic key. Add `ANTH_API_SECRET` to `.env.local` if you want live Claude responses.

### Port 8997 already in use

Another process is using the port. Find and kill it:
```bash
lsof -i :8997
kill -9 <PID>
```

---

## Optional: Full Setup with Database

For full functionality (user accounts, credits, deployments), you need a database.

See `docs/database/SETUP.md` for:
- Supabase setup (recommended for beginners)
- Self-hosted PostgreSQL setup

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `bun install` | Install all dependencies |
| `bun run setup` | Create local workspace |
| `bun run web` | Start dev server (port 8997) |
| `bun run dev` | Full dev environment (all services) |
| `bun run test` | Run unit tests |
| `bun run format` | Format code |
| `bun run lint` | Lint code |

---

## What's Next?

After setup:
1. Open `http://localhost:8997`
2. Log in with `test@alive.local` / `test`
3. Start chatting with Claude in the stream interface
4. Your files are in `.alive/template/`

For architecture and contributing, see:
- `docs/architecture/README.md`
- `docs/security/README.md`
- `CLAUDE.md` (AI assistant guidelines)
