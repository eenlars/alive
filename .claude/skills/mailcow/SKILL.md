---
name: mailcow
description: Check and manage Mailcow email — read inboxes, search emails, check delivery logs, manage greylisting.
---

# /mailcow

Access the self-hosted Mailcow email server at `/opt/services/mailcow/`.

## Architecture

- **Hostname:** `mx.alive.best`
- **Web UI:** `127.0.0.1:8180` (internal only, proxied via Caddy)
- **API Key:** Stored in `/opt/services/mailcow/.env` as `MAILCOW_API_KEY`
- **Emails are encrypted at rest** — use `doveadm` to read, NOT raw maildir files

## Mailboxes

| Mailbox | Purpose |
|---------|---------|
| `dweil@mail.alive.best` | Dweil bot email |
| `sopje@mail.alive.best` | Sopje bot email |

To list all mailboxes:
```bash
curl -s "http://127.0.0.1:8180/api/v1/get/mailbox/all" \
  -H "X-API-Key: $(grep MAILCOW_API_KEY /opt/services/mailcow/.env | cut -d= -f2)" \
  -H "Content-Type: application/json"
```

## Reading Emails

### List all email UIDs
```bash
docker exec mailcowdockerized-dovecot-mailcow-1 doveadm search -u USER@mail.alive.best ALL
```

### List recent emails (since date)
```bash
docker exec mailcowdockerized-dovecot-mailcow-1 doveadm search -u USER@mail.alive.best SINCE 17-Feb-2026
```

### Get email headers (subject, from, date)
```bash
docker exec mailcowdockerized-dovecot-mailcow-1 doveadm fetch -u USER@mail.alive.best "hdr" mailbox INBOX uid UID 2>/dev/null | grep -iE "^(Subject|From|Date):"
```

### Get email body (decoded)
```bash
docker exec mailcowdockerized-dovecot-mailcow-1 doveadm fetch -u USER@mail.alive.best "body" mailbox INBOX uid UID 2>/dev/null | python3 -c "
import sys, quopri, re
data = sys.stdin.read()
decoded = quopri.decodestring(data.encode()).decode('utf-8', errors='replace')
print(decoded)
"
```

### Extract links from an email
```bash
docker exec mailcowdockerized-dovecot-mailcow-1 doveadm fetch -u USER@mail.alive.best "body" mailbox INBOX uid UID 2>/dev/null | python3 -c "
import sys, quopri, re
data = sys.stdin.read()
decoded = quopri.decodestring(data.encode()).decode('utf-8', errors='replace')
links = re.findall(r'href=\"(https?://[^\"]+)\"', decoded)
for l in links:
    print(l)
"
```

### List all subjects quickly
```bash
for uid in \$(docker exec mailcowdockerized-dovecot-mailcow-1 doveadm search -u USER@mail.alive.best ALL 2>/dev/null | awk '{print \$2}'); do
  subj=\$(docker exec mailcowdockerized-dovecot-mailcow-1 doveadm fetch -u USER@mail.alive.best "hdr" mailbox INBOX uid \$uid 2>/dev/null | grep -i "^Subject:" | head -1)
  from=\$(docker exec mailcowdockerized-dovecot-mailcow-1 doveadm fetch -u USER@mail.alive.best "hdr" mailbox INBOX uid \$uid 2>/dev/null | grep -i "^From:" | head -1)
  echo "UID \$uid: \$subj | \$from"
done
```

### Check other folders (Junk, Sent, Trash)
```bash
docker exec mailcowdockerized-dovecot-mailcow-1 doveadm mailbox list -u USER@mail.alive.best
docker exec mailcowdockerized-dovecot-mailcow-1 doveadm search -u USER@mail.alive.best mailbox Junk ALL
```

## Delivery Logs

### Check if an email was received/rejected
```bash
docker logs mailcowdockerized-postfix-mailcow-1 --tail 100 2>&1 | grep -i "USER@mail.alive.best"
```

### Check for greylisting issues
```bash
docker logs mailcowdockerized-postfix-mailcow-1 --tail 200 2>&1 | grep -i "greylist"
```

## Greylisting

Greylisting config: `/etc/rspamd/local.d/greylist.conf` inside the rspamd container.

### Check current config
```bash
docker exec mailcowdockerized-rspamd-mailcow-1 cat /etc/rspamd/local.d/greylist.conf
```

### Disable greylisting (if emails aren't arriving)
```bash
docker exec mailcowdockerized-rspamd-mailcow-1 sh -c 'echo "enabled = false;" > /etc/rspamd/local.d/greylist.conf'
cd /opt/services/mailcow && docker compose restart rspamd-mailcow
```

### Re-enable greylisting
```bash
docker exec mailcowdockerized-rspamd-mailcow-1 sh -c 'cat > /etc/rspamd/local.d/greylist.conf << EOF
whitelisted_ip = "http://nginx:8081/forwardinghosts.php";
ipv4_mask = 24;
ipv6_mask = 64;
message = "Greylisted, please try again later";
EOF'
cd /opt/services/mailcow && docker compose restart rspamd-mailcow
```

## Important Notes

- **NEVER curl verification/auth links** — just display them for the user to click
- Emails are encrypted at rest in Dovecot, raw maildir files are unreadable
- Use `doveadm fetch` with `"body"` or `"hdr"` fields, decoded via `quopri`
- Mailcow containers: `mailcowdockerized-{service}-1` (postfix, dovecot, rspamd, etc.)
- Container management: `cd /opt/services/mailcow && docker compose restart {service}-mailcow`
