#!/bin/bash
# Website Backup Script
# Called by systemd timer to backup all websites to GitHub
#
# Usage: ./backup-websites.sh
#
# Logs to journald (view with: journalctl -u website-backup.service)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "[Backup] Starting scheduled website backup..."
echo "[Backup] Project dir: $PROJECT_DIR"

# Run the backup using bun
bun -e "
import { backupWebsites } from './packages/site-controller/src/backup.ts';

try {
  const result = await backupWebsites();
  console.log('[Backup] Result:', JSON.stringify(result, null, 2));

  if (result.stagedFiles > 0) {
    console.log('[Backup] Successfully backed up ' + result.stagedFiles + ' files');
  } else {
    console.log('[Backup] No changes to backup');
  }
} catch (error) {
  console.error('[Backup] Failed:', error);
  process.exit(1);
}
"

echo "[Backup] Scheduled backup complete"
