#!/bin/bash
# Setup automatic test data cleanup (runs daily at 3 AM)

set -e

echo "🔧 Setting up automatic test data cleanup..."

# Create systemd service
cat > /etc/systemd/system/claude-bridge-cleanup.service <<'EOF'
[Unit]
Description=Claude Bridge Test Data Cleanup
After=network.target

[Service]
Type=oneshot
User=root
WorkingDirectory=/root/webalive/claude-bridge/apps/web
ExecStart=/root/.bun/bin/bun /root/webalive/claude-bridge/scripts/cleanup-test-database.ts --force
StandardOutput=append:/var/log/claude-bridge-cleanup.log
StandardError=append:/var/log/claude-bridge-cleanup.log
EOF

# Create systemd timer
cat > /etc/systemd/system/claude-bridge-cleanup.timer <<'EOF'
[Unit]
Description=Daily Test Data Cleanup Timer
Requires=claude-bridge-cleanup.service

[Timer]
# Run daily at 3 AM
OnCalendar=daily
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

# Reload systemd
systemctl daemon-reload

# Enable and start the timer
systemctl enable claude-bridge-cleanup.timer
systemctl start claude-bridge-cleanup.timer

echo "✅ Automatic cleanup configured!"
echo ""
echo "Status:"
systemctl status claude-bridge-cleanup.timer --no-pager
echo ""
echo "Next run:"
systemctl list-timers claude-bridge-cleanup.timer --no-pager
echo ""
echo "To run manually: systemctl start claude-bridge-cleanup.service"
echo "To view logs: tail -f /var/log/claude-bridge-cleanup.log"
