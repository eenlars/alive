# Systemd Service Templates

These are **templates only**. Do not copy them directly to /etc/systemd/system/.

## Server-Agnostic Setup

The actual service files are **generated** from `/var/lib/alive/server-config.json`:

```bash
# Generate service files
bun run gen:systemd

# Install generated services
sudo cp /var/lib/alive/generated/alive-*.service /etc/systemd/system/
sudo systemctl daemon-reload

# Start services
sudo systemctl start alive-dev
sudo systemctl enable alive-dev  # auto-start on boot
```

## Available Services

- `alive-dev.service` - Development server (port 8997)
- `alive-staging.service` - Staging server (port 8998)
- `alive-production.service` - Production server (port 9000)

## Configuration

All paths are read from `/var/lib/alive/server-config.json`:

```json
{
  "serverId": "srv-example",
  "paths": {
    "aliveRoot": "/root/alive",
    "sitesRoot": "/srv/webalive/sites"
  }
}
```

See `ops/server-config.example.json` for full schema.
