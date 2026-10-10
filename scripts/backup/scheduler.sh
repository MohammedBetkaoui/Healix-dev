#!/bin/bash
# Runs backup.sh every night at BACKUP_TIME (HH:MM, in the TZ time zone).
# The outcome of the last run is kept in STATUS_FILE for the container's
# health check: a failed backup makes the container unhealthy until the next
# successful one.
set -euo pipefail

BACKUP_TIME=${BACKUP_TIME:-02:30}
STATUS_FILE=${STATUS_FILE:-/tmp/healixdz-backup.status}
BACKUP_COMMAND=${BACKUP_COMMAND:-healixdz-backup}

if ! [[ "$BACKUP_TIME" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]]; then
  echo "BACKUP_TIME must be HH:MM (24 h), not '$BACKUP_TIME'." >&2
  exit 1
fi

# Seconds from now to the next BACKUP_TIME (today if still ahead, else
# tomorrow).
seconds_to_next() {
  local now next
  now=$(date +%s)
  next=$(date -d "today $BACKUP_TIME" +%s)
  if [ "$next" -le "$now" ]; then
    next=$(date -d "tomorrow $BACKUP_TIME" +%s)
  fi
  echo $((next - now))
}

echo "waiting $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STATUS_FILE"
echo "Nightly backups at $BACKUP_TIME ($(date +%Z), TZ=${TZ:-unset}), into ${BACKUP_DIR:-/backups}."

while true; do
  wait_seconds=$(seconds_to_next)
  echo "Next backup in $((wait_seconds / 3600)) h $((wait_seconds % 3600 / 60)) min."
  sleep "$wait_seconds"
  if "$BACKUP_COMMAND"; then
    echo "ok $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STATUS_FILE"
  else
    echo "failed $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STATUS_FILE"
    echo "Backup FAILED; next attempt tomorrow at $BACKUP_TIME." >&2
  fi
done
