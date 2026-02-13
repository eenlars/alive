# Alive

**The cloud was not built for agents.**

Coding models can now run for 8+ hours, close the deployment loop, discover and use tools on their own, and collaborate with other agents. They don't need hand-holding. They need infrastructure.

But where do they actually run? In a chat window you can't close. On your laptop that goes to sleep. In someone else's cloud with someone else's constraints. On platforms designed for humans typing prompts, not agents running autonomously.

Alive is the infrastructure layer. Open-source. Self-hosted. Give every agent an isolated workspace with a filesystem, dev server, deployment pipeline, skills, and scheduled automation. Start a run before bed. Wake up to working software.

<a href="https://alive.best"><strong>alive.best</strong></a> &nbsp;&middot;&nbsp; <a href="./docs/README.md">Docs</a> &nbsp;&middot;&nbsp; <a href="./docs/GETTING_STARTED.md">Get Started</a>

---

## Make something agents want

Devin, Lovable, Replit, v0 — they figured out the model part. But they're closed platforms. Your code lives on their infrastructure, on their terms.

Claude Code and Codex CLI are incredibly powerful — but they're terminal sessions. Close the tab, the agent dies. No persistence. No scheduling. No skill discovery. No multi-tenant. No deployment loop.

What agents actually need is what any good employee needs: their own workspace, their own tools, their own identity, and the ability to keep working when you're not watching.

That's what Alive is.

---

## What makes this different

### Always-on agents

Schedule recurring tasks with cron. "Every morning, check for broken links and fix them." "After every deploy, run the accessibility audit." Agents don't stop when you close the browser. Start a run before bed, wake up to results. This is what always-on actually looks like.

### Skill discovery and MCP

Agents ship with core tools (Read, Write, Edit, Glob, Grep). But the system is open. Connect any MCP server — Linear, Stripe, Google Maps, Supabase — or build your own. Agents discover and use available skills without being told. The platform is a runtime for skills, not a walled garden.

### Close the loop: code → deploy → verify → iterate

Agents don't just write code. They restart the dev server, check the live preview, read the logs, and keep iterating until it actually works. With validation targets, they'll grind for hours without drifting. Without them, they're still excellent — but with clear pass/fail tests, they become a different class of tool entirely.

### Multi-agent ready

Multiple agents can work on the same server, in isolated workspaces, on different projects — or collaborate on the same one. The multi-tenant architecture and workspace isolation were built for this from day one. Multi-agent orchestration finally works when agents have real environments to run in.

### Real isolation, not Docker theater

Every project gets a dedicated Linux user via systemd. Filesystem boundary. Process separation. Path validation on every operation. The kernel enforces isolation. No amount of prompt injection escapes a filesystem boundary. This is how you let agents run unsupervised and actually sleep at night.

### Self-hosted. Multi-tenant. Yours.

One server. Your whole team. No per-seat pricing, no cloud lock-in, no "contact sales." Deploy on a $20 VPS or your enterprise infrastructure. The same build runs anywhere. You own the data, the code, and the agents.

---

## How it works

```
You: "Redesign the pricing section with a comparison table"

Agent reads your code → edits 4 files → restarts dev server
→ Live preview updates in the side panel
→ You see every change as it happens
```

```
Automation: "Every Monday at 9am"
→ Agent audits homepage → fixes 2 broken links → commits
→ Results waiting when you wake up
```

```
Skill: Linear connected via MCP
→ Agent triages new issues → assigns priority → updates board
→ No prompt needed. It just runs.
```

---

## Architecture

```
Browser (Chat · Live Preview · Terminal · File Editor)
         │
         │ SSE + REST
         ▼
Next.js 16 (Auth · Streaming · Sessions · Credits)
         │
         │ Claude Agent SDK + MCP
         │ Core tools + custom skills + integrations
         │
         │ path validation (every operation)
         ▼
Workspace Sandboxes (systemd isolation)
  /srv/webalive/sites/project-a/  →  user: site-project-a
  /srv/webalive/sites/project-b/  →  user: site-project-b
```

**Security model:** each project = a Linux user. Agent runs as that user. Kernel enforces the boundary.

### Project structure

```
apps/
├── web/                  # Next.js — chat, agent API, auth, deployments
├── broker/               # Streaming state machine + persistence
├── shell-server-go/      # Terminal + file editor (Go)
└── mcp-servers/          # External service integrations

packages/
├── tools/                # Agent workspace tools + MCP server
├── site-controller/      # Deployment orchestration (systemd + caddy)
├── shared/               # Types, constants, env definitions
├── database/             # Supabase schema types
├── oauth-core/           # Multi-tenant OAuth (AES-256-GCM)
└── redis/                # Sessions + caching
```

---

## Quick start

```bash
git clone https://github.com/user/alive.git && cd alive
bun install
bun run setup

echo 'ANTHROPIC_API_KEY=your_key' > apps/web/.env.local
echo 'ALIVE_ENV=local' >> apps/web/.env.local

bun run dev
```

Open `localhost:8997`. Login: `test@alive.local` / `test`.

### Production

```bash
bun run setup:server:prod   # First-time server setup
make ship                   # Production (port 9000)
make staging                # Staging (port 8998)
```

One Linux server. Caddy for TLS. Systemd for everything. [Deployment guide →](./docs/deployment/deployment.md)

---

## Stack

[Bun](https://bun.sh) · [Next.js 16](https://nextjs.org) · [React 19](https://react.dev) · [Claude Agent SDK](https://docs.anthropic.com) · [Supabase](https://supabase.com) · [Tailwind 4](https://tailwindcss.com) · [Turborepo](https://turbo.build) · [Caddy](https://caddyserver.com) · systemd · TypeScript (strict, no `any`, no `as`)

---

## Development

```bash
bun run dev              # Dev server
bun run test             # Unit tests
bun run e2e              # E2E tests (Playwright)
bun run static-check     # Type check + lint + format + tests
```

[Testing guide →](./docs/testing/TESTING_GUIDE.md)

---

## Docs

[Getting Started](./docs/GETTING_STARTED.md) · [Architecture](./docs/architecture/README.md) · [Security](./docs/security/README.md) · [Testing](./docs/testing/README.md) · [Deployment](./docs/deployment/deployment.md) · [Features](./docs/features/README.md) · [Vision](./docs/VISION.md)

---

## License

Sustainable Use License. See [LICENSE](./LICENSE) for details. Enterprise features require a separate license — see [LICENSE_EE](./LICENSE_EE.md).
