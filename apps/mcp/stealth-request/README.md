# Stealth Request Service

Web scraping service using Puppeteer with stealth plugin to bypass anti-bot detection.

## Features

- **Stealth Mode**: Uses `puppeteer-extra-plugin-stealth` to avoid bot detection
- **Network Recording**: Optional network request tracking
- **Flexible Headers**: Custom header support (sanitized for security)
- **Format Conversion**: Return HTML or Markdown (with auto-cleaning of nav/header/footer)
- **Drop-in Fetch Replacement**: Compatible with standard fetch API

## Setup

### 1. Install Dependencies & Chrome

```bash
# From project root
bash apps/mcp/stealth-request/scripts/setup.sh
```

Or manually:

```bash
export PUPPETEER_CACHE_DIR=/root/.cache/puppeteer
npx puppeteer browsers install chrome
bun install --cwd apps/mcp/stealth-request
```

### 2. Set Environment Variables

```bash
export PUPPETEER_CACHE_DIR=/root/.cache/puppeteer
```

### 3. Start the Service

```bash
bun apps/mcp/stealth-request/server.ts
```

Service will listen on `http://0.0.0.0:1234`

## API

### GET /health

Health check endpoint.

```bash
curl http://localhost:1234/health
# {"status":"ok","service":"stealth-server","port":1234}
```

### POST /fetch

Fetch a URL using stealth Puppeteer.

**Request Parameters:**
- `url` (required): URL to fetch
- `method` (optional): HTTP method (GET, POST, etc). Default: "GET"
- `headers` (optional): Custom headers object
- `body` (optional): Request body (for POST, PUT, etc)
- `timeout` (optional): Request timeout in milliseconds
- `recordNetworkRequests` (optional): Capture network requests. Default: false
- `originUrl` (optional): Navigate to origin first for cookies (different subdomain)
- `format` (optional): Response format - "html" or "markdown". Default: "html"

**Example Request (HTML):**
```json
{
  "url": "https://example.com",
  "method": "GET",
  "headers": { "User-Agent": "Custom User Agent" },
  "body": null,
  "timeout": 30000,
  "recordNetworkRequests": false,
  "originUrl": "https://example.com",
  "format": "html"
}
```

**Example Request (Markdown):**
```json
{
  "url": "https://example.com/article",
  "format": "markdown"
}
```

**Response:**
```json
{
  "success": true,
  "status": 200,
  "statusText": "OK",
  "headers": { "content-type": "text/html; charset=utf-8" },
  "body": "<html>...</html>",
  "url": "https://example.com",
  "format": "html",
  "networkRequests": []
}
```

**Markdown Response Example:**
```json
{
  "success": true,
  "status": 200,
  "statusText": "OK",
  "headers": { "content-type": "text/html; charset=utf-8" },
  "body": "# Article Title\n\nArticle content here...",
  "url": "https://example.com/article",
  "format": "markdown",
  "networkRequests": []
}
```

## Example Usage

### Fetch as HTML (default)

```bash
curl -X POST http://localhost:1234/fetch \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

### Fetch as Markdown

```bash
curl -X POST http://localhost:1234/fetch \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/article", "format": "markdown"}'
```

### Fetch with Custom Headers

```bash
curl -X POST http://localhost:1234/fetch \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://api.example.com/data",
    "headers": {"Authorization": "Bearer token123"}
  }'
```

### Fetch and Convert to Markdown

```bash
curl -X POST http://localhost:1234/fetch \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://architectelevator.com/transformation/mighty-metaphor/",
    "format": "markdown"
  }' | jq -r '.body'
```

## Features

### Network Request Recording

Set `recordNetworkRequests: true` to capture all network requests made during page load:

```json
{
  "url": "https://example.com",
  "recordNetworkRequests": true
}
```

Returns array of network requests with:
- URL, method, resource type
- Request/response headers and status
- POST data (if available)

### Origin URL

Use `originUrl` for APIs on different subdomains. The browser will navigate to `originUrl` first to establish cookies:

```json
{
  "url": "https://api.example.com/data",
  "originUrl": "https://example.com"
}
```

### Markdown Conversion

Set `format: "markdown"` to automatically convert HTML to clean Markdown using **Turndown**:

**What it does:**
- Uses [Turndown](https://github.com/mixmark-io/turndown) library for robust HTML-to-Markdown conversion
- Removes `<script>`, `<style>`, `<nav>`, `<header>`, `<footer>` tags
- Extracts main content from `<main>` or `<article>` tags
- Properly handles nested elements and complex HTML structures
- Converts headings to `# ## ### ####` format
- Converts bold/italic to `**text**` and `*text*`
- Converts links to `[text](url)` format
- Converts lists to markdown format with proper indentation
- Handles code blocks and inline code properly
- Cleans up whitespace

**Example:**
```json
{
  "url": "https://example.com/article",
  "format": "markdown"
}
```

**Output:**
```markdown
# Article Title

Clean content without navigation, headers, or footers.

## Section

Paragraph text here.

- List item 1
- List item 2

[Link text](https://example.com)
```

## Configuration

### Cache Directory

Set `PUPPETEER_CACHE_DIR` to customize Chrome installation location:

```bash
export PUPPETEER_CACHE_DIR=/custom/path/.cache/puppeteer
```

### Port

Edit `server.ts` line 10 to change port:

```typescript
const PORT = 1234 // Change this
```

## Architecture

- **server.ts**: Express server with `/health` and `/fetch` endpoints
- **src/index.ts**: Core `stealthRequest()` function with puppeteer setup
- **src/stealthFetch.ts**: Drop-in `fetch()` replacement
- **src/StealthResponse.ts**: Response object compatible with native fetch
- **src/types.ts**: TypeScript interfaces
- **src/constants.ts**: User agents and defaults

## Security Notes

- Headers with `Sec-*`, `Proxy-*` prefixes are stripped for safety
- Forbidden headers like `Host`, `Content-Length` are removed
- All network requests are captured and sanitized
- Consider running as non-root in production

## Troubleshooting

### Chrome not found

```bash
# Set cache directory
export PUPPETEER_CACHE_DIR=/root/.cache/puppeteer

# Reinstall Chrome
npx puppeteer browsers install chrome

# Restart service
bun apps/mcp/stealth-request/server.ts
```

### Port already in use

```bash
# Kill existing process
lsof -ti:1234 | xargs kill -9

# Or change PORT in server.ts
```

### Rate limiting (429 errors)

Some sites rate-limit scrapers even with stealth plugin. Consider:
- Adding delays between requests
- Using different user agents
- Rotating IP addresses (via proxy)

## License

Same as parent project
