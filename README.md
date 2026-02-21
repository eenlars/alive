# Alive

Self-hosted platform for AI agents that build and maintain websites. Each project gets a real Linux user, a real dev server, and a real deployment pipeline. The agent writes code, restarts the server, checks the live preview, and iterates — with or without you watching.

Open source. Runs on one server. Currently powering 120+ sites at [alive.best](https://alive.best).

<a href="https://alive.best"><strong>Try it</strong></a> &nbsp;&middot;&nbsp; <a href="./docs/GETTING_STARTED.md">Self-host</a> &nbsp;&middot;&nbsp; <a href="./docs/README.md">Docs</a>

<!-- TODO: Replace with a GIF/screenshot of chat + live preview side by side -->
<p align="center">
  <img src="docs/assets/demo.gif" alt="Agent building a site with live preview" width="800">
</p>

---

## Why this exists

AI coding tools give you code. But code isn't a website. Someone still has to run it, preview it, debug it, deploy it, and keep it working.

Alive closes that loop. The agent operates in a full Linux environment — it can read files, write files, install packages, restart the dev server, and see what the user sees via a live preview. When something breaks, it reads the logs and fixes it. When you schedule a task, it runs on cron even after you close the browser.

The hard part isn't the AI. It's giving it a real environment to work in without compromising security.

---

## How isolation works

Every project gets a dedicated Linux user created by systemd. Not a container — a real user with kernel-enforced filesystem boundaries.

```
site-acme-com    → /srv/webalive/sites/acme.com/
site-blog-xyz    → /srv/webalive/sites/blog.xyz/
```

The agent runs as that user. Every file operation goes through path validation. Every tool call is checked against the workspace boundary. No amount of prompt injection gives you access to another project's files — the kernel won't allow it.

This is what lets you run agents unsupervised. The security model doesn't depend on the AI behaving correctly.

---

## What the agent can do

**Core tools:** Read, Write, Edit, Glob, Grep — file operations scoped to the workspace.

**Server control:** Restart the dev server, read logs, check if the build succeeded.

**Live preview:** The agent sees a live preview of the running site. It makes changes, the preview updates, it evaluates the result and keeps iterating.

**MCP integrations:** Connect Linear, Stripe, GitHub, Google Maps, or any MCP server. The agent discovers available tools and uses them.

**Scheduled automation:** Define cron jobs. "Every Monday, audit the site and fix broken links." The agent runs on schedule, commits results, and reports back.

---

## Architecture

```
Browser (Chat · Live Preview · Terminal · File Editor)
         │
         │ SSE streaming
         ▼
Next.js 16 (Auth · Sessions · Credits · Tool routing)
         │
         │ Claude Agent SDK
         │ Tool callbacks with path validation
         ▼
Workspace sandbox (/srv/webalive/sites/[domain]/)
         │
         │ Runs as dedicated Linux user
         │ systemd process isolation
         ▼
Dev server (Bun/Vite) → Live preview via reverse proxy
```

### Design decisions

**systemd over Docker.** Each site is a systemd service with a dedicated user. Simpler than containers, better resource control, native process management. `systemctl restart site@acme-com` just works.

**SSE over WebSocket.** Server-Sent Events for streaming Claude responses. Simpler protocol, works through every proxy and CDN, auto-reconnects. The browser gets each token as it's generated.

**Caddy over nginx.** Automatic HTTPS, simple config, zero-downtime reloads. Adding a new site is one config block and `systemctl reload caddy`.

**Path validation over permissions.** Every file operation calls `isPathWithinWorkspace()` before touching the filesystem. Defense in depth — even if the Linux user somehow gets escalated, the application layer still blocks it.

**One server.** No Kubernetes. No microservices. A single Linux server runs the web app, all the workspaces, Caddy, and the automation worker. This handles 120+ sites comfortably. Scale when you actually need to, not before.

---

## Quick start

```bash
git clone https://github.com/eenlars/alive.git && cd alive
bun install
bun run setup

echo 'ANTHROPIC_API_KEY=your_key' > apps/web/.env.local
echo 'ALIVE_ENV=local' >> apps/web/.env.local

bun run dev
```

Open `localhost:8997`. Login with `test@alive.local` / `test`.

[Full setup guide →](./docs/GETTING_STARTED.md)

---

## Project structure

```
apps/
├── web/                  # Next.js — chat UI, streaming API, auth, deployments
├── worker/               # Automation scheduler + job executor
├── preview-proxy/        # Go reverse proxy for live site previews
└── mcp-servers/          # External service integrations (Google Maps, etc.)

packages/
├── tools/                # Agent workspace tools + MCP server
├── site-controller/      # Site deployment (systemd + Caddy orchestration)
├── automation-engine/    # Job lifecycle, lease-based locking, run logs
├── shared/               # Types, constants, environment config
├── database/             # Auto-generated Supabase types
├── oauth-core/           # Multi-tenant OAuth (AES-256-GCM)
└── redis/                # Session store + caching
```

## Stack

[Bun](https://bun.sh) · [Next.js 16](https://nextjs.org) · [React 19](https://react.dev) · [Claude Agent SDK](https://docs.anthropic.com) · [Supabase](https://supabase.com) · [Tailwind 4](https://tailwindcss.com) · [Turborepo](https://turbo.build) · [Caddy](https://caddyserver.com) · [Go](https://go.dev) · systemd · TypeScript (strict, no `any`)

---

## Production

```bash
make ship        # staging → production pipeline
make staging     # staging only (port 8998)
make production  # production only (port 9000)
```

One server. Caddy for TLS. Systemd for everything. [Deployment guide →](./docs/deployment/deployment.md)

## Development

```bash
bun run dev              # Dev server (port 8997)
bun run unit             # Unit tests
bun run e2e              # E2E tests (Playwright)
bun run static-check     # Full check (types + lint + tests)
```

[Testing guide →](./docs/testing/TESTING_GUIDE.md)

---

## Docs

- [Getting Started](./docs/GETTING_STARTED.md) — Setup and first run
- [Architecture](./docs/architecture/README.md) — System design and core patterns
- [Security](./docs/security/README.md) — Isolation model, auth, sandboxing
- [Testing](./docs/testing/README.md) — Unit, integration, E2E
- [Deployment](./docs/deployment/deployment.md) — Production and staging
- [Vision](./docs/VISION.md) — Where this is going

---

## License

Sustainable Use License. See [LICENSE](./LICENSE). Enterprise features: [LICENSE_EE](./LICENSE_EE.md).
