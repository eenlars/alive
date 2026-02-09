# Alive

**AI coding tools solved the wrong problem.**

Cursor and Copilot made autocomplete smarter. Lovable and v0 generate throwaway prototypes. Devin charges $500/month to run agents you can't see in a cloud you don't control.

None of them give you an agent that keeps working after you close the tab. None of them run on your infrastructure. None of them let you extend what the agent can do.

Alive is an open-source agent workspace. Self-hosted. Sandboxed. Extensible. Agents that build, deploy, and maintain your projects — on your server, on your terms.

<a href="https://alive.best"><strong>alive.best</strong></a> &nbsp;&middot;&nbsp; <a href="./docs/README.md">Docs</a> &nbsp;&middot;&nbsp; <a href="./docs/GETTING_STARTED.md">Get Started</a>

---

## Not a coding assistant. An agent workspace.

Most AI tools are single-player and single-session. You prompt, you get output, you're done.

Alive is infrastructure. Agents get a real workspace — isolated filesystem, live dev server, deployment pipeline, terminal, MCP integrations — and they keep working. Schedule an agent to audit your site every Monday. Connect it to Linear and let it triage bugs. Give it a custom skill that runs your test suite.

The chat is one surface. The workspace is the product.

---

## What makes this different

### Agents that don't stop

Schedule recurring tasks with cron expressions. "Every morning, check for broken links and fix them." "After every deploy, run the accessibility audit." Agents run in the background, results stream in real-time. This isn't a chatbot — it's an always-on workforce.

### Custom skills and MCP integrations

Agents ship with Read, Write, Edit, Glob, Grep. But the tool system is open. Connect any MCP server — Linear, Stripe, Google Maps, Supabase, or your own. Build custom skills that extend what agents can do. The platform is a runtime, not a walled garden.

### Real isolation, not Docker theater

Every project gets a dedicated Linux user via systemd. Filesystem boundary. Process separation. Path validation on every operation. The kernel enforces isolation — no amount of prompt injection escapes it. This is how you run untrusted agents safely.

### Live preview

Split-pane: chat on the left, your site on the right. Changes appear as the agent makes them. Click any element to reference it in your next message. You see everything the agent does, in real-time.

### Self-hosted, multi-tenant

One server. Your whole team. No per-seat pricing, no cloud lock-in, no "contact sales." Deploy on a $20 VPS or your enterprise infrastructure. You own the data, the code, and the agents.

### Human-in-the-loop ready

Real-time streaming shows exactly what agents are doing. Multi-tenant auth with org memberships. The foundation for approval workflows — full autonomy for safe operations, human oversight for everything that matters.

---

## How it works

```
You: "Redesign the pricing section with a comparison table"

Agent reads your code → edits 4 files → restarts dev server
→ Live preview updates instantly in the side panel
```

```
Automation: "Every Monday at 9am"
→ Agent audits homepage → fixes 2 broken links → commits changes
→ Results in your dashboard when you arrive
```

```
Skill: "Run Lighthouse audit"
→ Agent runs custom MCP tool → scores 94 → opens issue for remaining 6 points
```

---

## Architecture

```
Browser (Chat · Preview · Terminal · Editor)
         │
         │ SSE + REST
         ▼
Next.js 16 (Auth · Streaming · Sessions · Credits)
         │
         │ Claude Agent SDK + MCP
         │ Built-in tools + custom skills + integrations
         │
         │ path validation (every operation)
         ▼
Workspace Sandboxes (systemd isolation)
  /srv/webalive/sites/project-a/  →  user: site-project-a
  /srv/webalive/sites/project-b/  →  user: site-project-b
```

**Security model:** each site = a Linux user. Agent runs as that user. Kernel enforces the boundary.

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
├── redis/                # Sessions + caching
└── stream-types/         # SSE protocol types
```

---

## Quick start

```bash
git clone https://github.com/user/alive.git && cd alive
bun install
bun run setup

# Add your API key
echo 'ANTHROPIC_API_KEY=your_key' > apps/web/.env.local
echo 'ALIVE_ENV=local' >> apps/web/.env.local

bun run dev
```

Open `localhost:8997`. Login: `test@alive.local` / `test`.

### Production

```bash
bun run setup:server:prod   # First-time server setup
make ship                   # Deploy to production (port 9000)
make staging                # Deploy to staging (port 8998)
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

MIT
