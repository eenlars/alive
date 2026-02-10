#!/bin/bash
# Setup automatic test data cleanup (runs daily at 3 AM)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "🔧 Setting up automatic test data cleanup..."

# Create systemd service (uses PROJECT_ROOT resolved at setup time)
cat > /etc/systemd/system/alive-cleanup.service <<EOF
[Unit]
Description=Alive Test Data Cleanup
After=network.target

[Service]
Type=oneshot
User=root
WorkingDirectory=${PROJECT_ROOT}/apps/web
ExecStart=/root/.bun/bin/bun ${PROJECT_ROOT}/scripts/cleanup-test-database.ts --force
StandardOutput=append:/var/log/alive-cleanup.log
StandardError=append:/var/log/alive-cleanup.log
EOF

# Create systemd timer
cat > /etc/systemd/system/alive-cleanup.timer <<'EOF'
[Unit]
Description=Daily Test Data Cleanup Timer
Requires=alive-cleanup.service

[Timer]
# Run daily at 3 AM
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

# Reload systemd
systemctl daemon-reload

# Enable and start the timer
systemctl enable alive-cleanup.timer
systemctl start alive-cleanup.timer

echo "✅ Automatic cleanup configured!"
echo ""
echo "Status:"
systemctl status alive-cleanup.timer --no-pager
echo ""
echo "Next run:"
systemctl list-timers alive-cleanup.timer --no-pager
echo ""
echo "To run manually: systemctl start alive-cleanup.service"
echo "To view logs: tail -f /var/log/alive-cleanup.log"
