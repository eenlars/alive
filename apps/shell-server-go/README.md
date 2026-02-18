# Shell Server (Go)

A Go-based shell server that provides the same functionality as the TypeScript shell-server. This is a parallel implementation for performance and deployment flexibility.

## Features

- **Web Terminal**: Full PTY-based terminal access via WebSocket
- **File Management**: Upload, browse, preview, and delete files
- **Code Editor**: Edit files with mtime tracking for conflict detection
- **Session Management**: Persistent sessions with cookie-based authentication
- **Rate Limiting**: Global rate limiting with lockout protection
- **Multi-workspace**: Support for site workspaces and custom directories

## Package Layout

- `cmd/shell-server` - standalone binary entrypoint
- `internal/app` - bootstrap, route wiring, lifecycle shutdown
- `internal/auth` - login/logout + scoped workspace validation
- `internal/terminal` - lease + websocket + PTY session handling
- `internal/workspace` - path/boundary/session workspace policy (single source of truth)
- `internal/files` - file APIs (upload, list, read, delete, sites/config)
- `internal/editor` - editor APIs with scoped-session policy
- `internal/templates` - template APIs with scoped-session policy
- `internal/httpx` - request parsing and JSON response helpers
- `test/e2e` and `internal/*/*_test.go` - end-to-end and package-level tests

## Requirements

- Go 1.22+
- Linux (PTY support)

## Quick Start

```bash
# Install dependencies
make deps

# Set required environment variable
export SHELL_PASSWORD="your-secret-password"

# Build and run
make run

# Or for development with hot-reload
make dev
```

## Configuration

The server uses the same `config.json` format as the TypeScript version:

```json
{
  "development": {
    "port": 3500,
    "defaultWorkspace": "root",
    "defaultCwd": ".alive/shell-server",
    "uploadDefaultCwd": ".alive/uploads",
    "sitesPath": ".alive/sites",
    "workspaceBase": "/root/webalive",
    "allowWorkspaceSelection": true
  },
  "production": {
    "port": 3888,
    "defaultWorkspace": "root",
    "defaultCwd": "/root/alive",
    "uploadDefaultCwd": "/root/uploads",
    "sitesPath": "/srv/webalive/sites",
    "workspaceBase": "/root/webalive",
    "allowWorkspaceSelection": true
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SHELL_PASSWORD` | Yes | Password for shell access |
| `NODE_ENV` | No | Environment (`development` or `production`) |
| `PORT` | No | Override configured port |

## API Endpoints

### Pages
- `GET /` - Login page
- `GET /dashboard` - Dashboard (protected)
- `GET /shell` - Terminal page (protected)
- `GET /upload` - Upload page (protected)
- `GET /edit` - Editor page (protected)

### Authentication
- `POST /login` - Submit login form
- `GET /logout` - Logout and clear session

### File Operations
- `POST /api/check-directory` - Check if directory exists
- `POST /api/upload` - Upload and extract ZIP file
- `POST /api/list-files` - List files in tree format
- `POST /api/read-file` - Read file contents
- `POST /api/delete-folder` - Delete file or folder
- `GET /api/sites` - List available site workspaces

### Editor API
- `POST /api/edit/list-files` - List files for editor
- `POST /api/edit/read-file` - Read file with mtime
- `POST /api/edit/write-file` - Write file with mtime tracking
- `POST /api/edit/check-mtimes` - Check file modification times
- `POST /api/edit/delete` - Delete file or folder
- `POST /api/edit/copy` - Copy file

### WebSocket
- `POST /api/ws-lease` - Mint short-lived WS lease (authenticated)
- `GET /ws?lease=<token>` - Terminal WebSocket connection

### Health
- `GET /health` - Health check endpoint

## Frontend Assets

The Go server serves the same frontend assets as the TypeScript version. It looks for client files in:

1. `./client/` (next to the binary)
2. `../shell-server/dist/client/` (fallback to TypeScript build)

To use the TypeScript frontend, ensure you've built it first:

```bash
cd ../shell-server
bun run build
```

## WebSocket Protocol

The terminal uses a mixed protocol for lower latency and lower overhead:

- **Binary frames** for terminal data path:
  - Client -> Server: raw PTY input bytes (keystrokes/paste)
  - Server -> Client: raw PTY output bytes
- **JSON text frames** for control path:
  - Client -> Server: `resize`, optional legacy `input`
  - Server -> Client: `connected`, `exit`, `error`, `pong`

```typescript
// Client -> Server (binary frame)
Uint8Array.from([0x6c, 0x73, 0x0a]) // "ls\n"

// Client -> Server (text control frame)
{ "type": "resize", "cols": 120, "rows": 40 }

// Server -> Client (text control frame)
{ "type": "connected" }
{ "type": "exit", "exitCode": 0 }
{ "type": "error", "message": "Failed to start shell" }
```

## Session Storage

Sessions are stored in `.sessions.json` (JSON array of tokens).
Rate limit state is stored in `.rate-limit-state.json`.

Both files persist across server restarts.

## Security

- Cookie-based authentication (HttpOnly, Secure in production, SameSite=Lax)
- Path traversal protection on all file operations
- Rate limiting with exponential backoff (40 attempts, 10min window, 15min lockout)
- Workspace sandboxing to prevent access outside allowed directories

## Development

```bash
# Format code
make fmt

# Run tests
make test

# Lint (requires golangci-lint)
make lint
```

## Comparison with TypeScript Version

| Feature | TypeScript | Go |
|---------|------------|-----|
| Runtime | Bun | Native binary |
| PTY | node-pty | creack/pty |
| WebSocket | @hono/node-ws | gorilla/websocket |
| HTTP | Hono | net/http |
| Build | esbuild (Bun) | go build |

Both versions maintain API compatibility and use the same frontend.
