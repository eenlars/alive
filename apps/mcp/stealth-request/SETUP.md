# Stealth Request - Quick Start Setup Guide

## One-Line Setup

```bash
bash apps/mcp/stealth-request/scripts/setup.sh
```

This will:
1. Verify `PUPPETEER_CACHE_DIR` is set (defaults to `~/.cache/puppeteer`)
2. Create the cache directory
3. Install Chrome via puppeteer
4. Install npm dependencies
5. Print next steps

## Manual Setup (if needed)

### Step 1: Set Environment Variable

```bash
export PUPPETEER_CACHE_DIR=/root/.cache/puppeteer
```

Add to your `.bashrc` or `.zshrc` for persistence:
```bash
echo 'export PUPPETEER_CACHE_DIR=/root/.cache/puppeteer' >> ~/.bashrc
```

### Step 2: Install Chrome

```bash
cd /root/webalive/alive/apps/mcp/stealth-request
npx puppeteer browsers install chrome
```

Verify installation:
```bash
ls $PUPPETEER_CACHE_DIR/chrome/
# Should show: linux-142.0.7444.59/
```

### Step 3: Install Dependencies

```bash
bun install
```

### Step 4: Start Service

```bash
bun apps/mcp/stealth-request/server.ts
```

Output should show:
```
🚀 Stealth server running on http://0.0.0.0:1234
📌 Health check: http://0.0.0.0:1234/health
📮 POST requests to: http://0.0.0.0:1234/fetch
```

## Testing

### Health Check

```bash
curl http://localhost:1234/health
# {"status":"ok","service":"stealth-server","port":1234}
```

### Fetch a Website

```bash
curl -X POST http://localhost:1234/fetch \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

## Deployment (systemd)

### Install as System Service

```bash
# Copy service file to systemd
sudo cp apps/mcp/stealth-request/stealth-request.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Start service
sudo systemctl start stealth-request
sudo systemctl status stealth-request

# Enable on boot
sudo systemctl enable stealth-request
```

### View Logs

```bash
# Recent logs
journalctl -u stealth-request -n 50

# Follow logs
journalctl -u stealth-request -f

# Since last hour
journalctl -u stealth-request --since "1 hour ago"
```

## Troubleshooting

### "Chrome not found" Error

```bash
# Re-install Chrome
export PUPPETEER_CACHE_DIR=/root/.cache/puppeteer
npx puppeteer browsers install --chrome

# Restart service
systemctl restart stealth-request
```

### Port 1234 Already in Use

```bash
# Find and kill existing process
lsof -ti:1234 | xargs kill -9

# Or change PORT in server.ts and rebuild
```

### Permission Denied

```bash
# Make setup script executable
chmod +x apps/mcp/stealth-request/scripts/setup.sh

# Run with proper permissions
bash apps/mcp/stealth-request/scripts/setup.sh
```

## Next Steps

- See [README.md](./README.md) for API documentation
- See [server.ts](./server.ts) for configuration options
- Check [src/](./src/) for implementation details
