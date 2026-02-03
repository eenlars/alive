# Google Scraper MCP Server

Standalone MCP server for Google Maps business search. Uses Puppeteer with stealth plugin for scraping.

## Usage Modes

### 1. Stdio Mode (Default)

Spawned as a child process by the Claude agent. No setup required - configured in `agent-constants.mjs`.

```javascript
// agent-constants.mjs
"google-scraper": {
  command: "node",
  args: ["./apps/mcp-servers/google-scraper/dist/index.js"],
}
```

### 2. Systemd Service (Production)

Run as a standalone service for better process isolation and independent scaling.

```bash
# Install service
sudo cp mcp-google-scraper.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable mcp-google-scraper
sudo systemctl start mcp-google-scraper

# Check status
sudo systemctl status mcp-google-scraper
journalctl -u mcp-google-scraper -f
```

When running as a service, update `agent-constants.mjs` to use HTTP transport:

```javascript
"google-scraper": {
  type: "http",
  url: "http://localhost:3100/mcp",
}
```

Note: HTTP transport requires adding an HTTP server wrapper (not included by default).

## Setup

```bash
# Install dependencies (also installs Chrome automatically)
bun install

# Build TypeScript
bun run build

# Or manually install browser if needed
bun run setup
```

**Troubleshooting browser install:**
```bash
# Permission issues? Use custom cache directory:
PUPPETEER_CACHE_DIR=/tmp/puppeteer bun run setup

# In Docker? Browser is pre-installed, just set:
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

### Docker

```bash
# Build image
docker build -t mcp-google-scraper .

# Run (stdio mode - for testing)
docker run -i mcp-google-scraper

# Run with docker-compose or as part of a larger stack
# Note: MCP stdio servers need stdin/stdout attached
```

## Tool

### `search_google_maps`

Search Google Maps for business information.

**Parameters:**
- `query` (string, required): Search query (e.g., "coffee shops in Amsterdam")
- `maxResults` (number, default: 10): Maximum results (1-20)
- `domainFilter` (string, optional): Filter by website domain
- `includeDetails` (boolean, default: false): Fetch full details (slower)

**Example:**
```json
{
  "query": "Albert Heijn Den Bosch",
  "maxResults": 5,
  "domainFilter": "albertheijn.nl",
  "includeDetails": true
}
```
