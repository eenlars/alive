# Gmail MCP Server

A Model Context Protocol (MCP) server for Gmail, designed for multi-tenant OAuth environments.

> **Attribution**: Forked from [GongRzhe/Gmail-MCP-Server](https://github.com/GongRzhe/Gmail-MCP-Server) and adapted for Bearer token authentication.

## Features

- **Bearer Token Auth**: Accepts OAuth tokens via HTTP Authorization header (no local credential storage)
- **MCP Protocol**: Full MCP compliance via `@modelcontextprotocol/sdk`
- **REST API**: Additional endpoints for direct API calls (Send, Draft)
- **Multi-tenant Ready**: Works with centralized OAuth token management

## Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /mcp` | MCP protocol (Claude tools) |
| `POST /api/send` | Send email (user action) |
| `POST /api/draft` | Save draft (user action) |
| `GET /health` | Health check |

## Tools

### For Claude (via MCP)

| Tool | Description |
|------|-------------|
| `compose_email` | Compose email for user review (returns UI card data) |
| `get_profile` | Get user's Gmail profile |
| `search_emails` | Search emails with Gmail query syntax |
| `get_email` | Get full email content by ID |
| `list_labels` | List all Gmail labels |
| `archive_email` | Archive an email |
| `mark_as_read` | Mark email as read |
| `mark_as_unread` | Mark email as unread |
| `trash_email` | Move email to trash |
| `add_label` | Add label to email |
| `remove_label` | Remove label from email |

### Internal (not for direct Claude use)

| Tool | Description |
|------|-------------|
| `send_email` | Send email immediately (use `compose_email` instead) |
| `create_draft` | Save draft immediately (use `compose_email` instead) |

## Usage

### Start Server

```bash
# HTTP mode (production)
node dist/index.js --transport http --port 8085

# Stdio mode (testing only - no auth)
node dist/index.js --transport stdio
```

### API Calls

All endpoints require `Authorization: Bearer <token>` header.

```bash
# Send email
curl -X POST http://localhost:8085/api/send \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to": "user@example.com", "subject": "Hello", "body": "World"}'

# Save draft
curl -X POST http://localhost:8085/api/draft \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to": "user@example.com", "subject": "Draft", "body": "Content"}'
```

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Watch mode
bun run dev

# Type check
bun run type-check
```

## Integration with WebAlive

This server is deployed as a systemd service (`mcp-gmail.service`) and proxied through the main application:

1. User connects Gmail via OAuth flow → token stored in Supabase
2. Claude uses `compose_email` → returns structured data for UI card
3. User clicks Send/Save Draft → frontend calls `/api/gmail/send` or `/api/gmail/draft`
4. Next.js API fetches token and proxies to this server

## License

MIT (following original repository license)
