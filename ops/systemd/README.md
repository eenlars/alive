# Systemd Service Templates

These are **templates only**. Do not copy them directly to /etc/systemd/system/.

## Server-Agnostic Setup

The actual service files are **generated** from `/var/lib/claude-bridge/server-config.json`:

```bash
# Generate service files
bun run gen:systemd

# Install generated services
sudo cp /var/lib/claude-bridge/generated/claude-bridge-*.service /etc/systemd/system/
sudo systemctl daemon-reload

# Start services
sudo systemctl start claude-bridge-dev
sudo systemctl enable claude-bridge-dev  # auto-start on boot
```

## Available Services

- `claude-bridge-dev.service` - Development server (port 8997)
- `claude-bridge-staging.service` - Staging server (port 8998)
- `claude-bridge-production.service` - Production server (port 9000)
- `claude-bridge-broker.service` - WebSocket broker

## Configuration

All paths are read from `/var/lib/claude-bridge/server-config.json`:

```json
{
  "serverId": "srv-example",
  "paths": {
    "bridgeRoot": "/root/alive",
    "sitesRoot": "/srv/webalive/sites"
  }
}
```

See `ops/server-config.example.json` for full schema.
