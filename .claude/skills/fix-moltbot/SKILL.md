---
name: Fix Moltbot
description: Fix the OpenClaw/Moltbot gateway when its Anthropic OAuth credentials expire. Copies fresh tokens from Claude Code.
---

# Fix Moltbot (OpenClaw Gateway)

The OpenClaw gateway (`openclaw-gateway.service`) runs as a Telegram/WhatsApp bot at `/opt/services/clawdbot/`. It authenticates to Anthropic via OAuth tokens stored in an auth-profiles file. These tokens expire and need periodic refresh.

## Diagnosis

Check if the gateway is failing with OAuth errors:

```bash
journalctl -u openclaw-gateway -n 50 --no-pager | grep -i 'oauth\|error'
```

The telltale error is:
```text
OAuth token refresh failed for anthropic: Failed to refresh OAuth token for anthropic.
```

## How to Fix

### 1. Read the fresh Claude Code credentials

Claude Code keeps a valid OAuth token (with refresh token) at:

```text
/root/.claude/.credentials.json
```

Read this file. The relevant fields are inside `claudeAiOauth`:
- `accessToken` — maps to `access`
- `refreshToken` — maps to `refresh`
- `expiresAt` — maps to `expires`

### 2. Update the OpenClaw auth profile

The auth profile lives at:

```text
/root/.openclaw/agents/main/agent/auth-profiles.json
```

Replace the `profiles["anthropic:claude-cli"]` entry with the fresh tokens:

```json
{
  "version": 1,
  "profiles": {
    "anthropic:claude-cli": {
      "type": "oauth",
      "provider": "anthropic",
      "access": "<accessToken from Claude Code>",
      "refresh": "<refreshToken from Claude Code>",
      "expires": <expiresAt from Claude Code>
    }
  },
  "lastGood": {
    "anthropic": "anthropic:claude-cli"
  },
  "usageStats": {
    "anthropic:claude-cli": {
      "lastUsed": 0,
      "errorCount": 0
    }
  }
}
```

Reset `errorCount` to 0 and keep the existing structure.

### 3. Restart the gateway

```bash
systemctl restart openclaw-gateway
```

### 4. Verify

Wait a few seconds, then confirm no OAuth errors:

```bash
sleep 5 && journalctl -u openclaw-gateway --since "10 seconds ago" --no-pager | grep -i 'error\|oauth'
```

The only acceptable error is the WhatsApp session logout (unrelated):
```text
WhatsApp session logged out. Run: openclaw channels login
```

If cron jobs exist, wait for the next cron tick (check `journalctl` for `cron` events) to confirm they run without OAuth failures.

## Key Files

| File | Purpose |
|------|---------|
| `/root/.claude/.credentials.json` | Source: Claude Code OAuth tokens (auto-refreshed) |
| `/root/.openclaw/agents/main/agent/auth-profiles.json` | Target: OpenClaw auth profile |
| `/opt/services/clawdbot/` | OpenClaw installation directory |
| `openclaw-gateway.service` | Systemd service |
