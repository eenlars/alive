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
- `alive-runtime-status.service` - Runs runtime status checks (disk, Claude runtime write, `/api/health`)
- `alive-runtime-status.timer` - Runs runtime status check every 5 minutes
- `alive-build-prune.service` - Deletes `.builds/{env}/dist.*` older than 7 days
- `alive-build-prune.timer` - Runs build pruning daily

## Timer Setup

`bun run setup:server --enable` installs and enables these timers automatically.

For manual setup, replace `__ALIVE_ROOT__` in the unit templates before copying:

```bash
ALIVE_ROOT=/root/webalive/alive
for unit in alive-runtime-status.service alive-runtime-status.timer alive-build-prune.service alive-build-prune.timer; do
  sed "s#__ALIVE_ROOT__#${ALIVE_ROOT}#g" "ops/systemd/$unit" | sudo tee "/etc/systemd/system/$unit" >/dev/null
done
sudo systemctl daemon-reload
sudo systemctl enable --now alive-runtime-status.timer alive-build-prune.timer
```

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
