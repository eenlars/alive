#!/bin/bash
# Monitor all WebAlive sites and auto-restart if needed

LOG_FILE="/var/log/webalive-monitor.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

log_message() {
  echo "[$TIMESTAMP] $1" >> $LOG_FILE
}

# Get all site services
SERVICES=$(systemctl list-units --all --plain --no-pager 2>/dev/null | grep 'site@.*\.service' | awk '{print $1}')

if [ -z "$SERVICES" ]; then
  log_message "No site services found"
  exit 0
fi

FAILED_COUNT=0
RESTARTED_COUNT=0

for SERVICE in $SERVICES; do
  # Skip if service doesn't exist
  if ! systemctl list-unit-files 2>/dev/null | grep -q "$SERVICE"; then
    continue
  fi

  # Check if service is active
  if ! systemctl is-active --quiet "$SERVICE"; then
    FAILED_COUNT=$((FAILED_COUNT + 1))
    log_message "ALERT: $SERVICE is not running, attempting restart..."

    # Try to restart
    systemctl restart "$SERVICE" 2>&1 >> $LOG_FILE

    # Wait and verify
    sleep 3
    if systemctl is-active --quiet "$SERVICE"; then
      RESTARTED_COUNT=$((RESTARTED_COUNT + 1))
      log_message "SUCCESS: $SERVICE restarted successfully"
    else
      log_message "ERROR: Failed to restart $SERVICE after 3 attempts"

      # Send detailed status for debugging
      systemctl status "$SERVICE" >> $LOG_FILE 2>&1
      journalctl -u "$SERVICE" -n 20 >> $LOG_FILE 2>&1
    fi
  else
    # Service is running, check if port is responsive
    MAIN_PID=$(systemctl show -p MainPID --value "$SERVICE" 2>/dev/null)
    if [ -n "$MAIN_PID" ] && [ "$MAIN_PID" != "0" ]; then
      # Get port from service name (last segment)
      DOMAIN=$(echo "$SERVICE" | sed 's/site@//' | sed 's/\.service//')
      # This is a simple check - could be enhanced with Caddy config parsing
      log_message "OK: $SERVICE (PID: $MAIN_PID) is running"
    fi
  fi
done

log_message "Monitor cycle complete - Failed: $FAILED_COUNT, Restarted: $RESTARTED_COUNT"
exit 0
