#!/bin/bash
# One backup of HealixDz, in BACKUP_DIR:
#   healixdz-db-<UTC time>.sql.gz[.age]      mysqldump --single-transaction
#   healixdz-files-<UTC time>.tar.gz[.age]   the patient files volume
# each with its SHA-256 next to it (<archive>.sha256, checkable with
# "sha256sum -c"). With BACKUP_AGE_RECIPIENT (an age public key), the
# archives are encrypted on the fly: no clear copy ever touches the disk.
# Then the backups older than BACKUP_RETENTION_DAYS are removed.
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-/backups}
FILES_DIR=${FILES_DIR:-/data/patient-files}
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14}
MYSQL_HOST=${MYSQL_HOST:-mysql}
MYSQL_PORT=${MYSQL_PORT:-3306}
: "${MYSQL_DATABASE:?MYSQL_DATABASE is required}"
: "${MYSQL_USER:?MYSQL_USER is required}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD is required}"
RECIPIENT=${BACKUP_AGE_RECIPIENT:-}

case "$RETENTION_DAYS" in
  '' | *[!0-9]*) echo "BACKUP_RETENTION_DAYS must be a number of days." >&2; exit 1 ;;
esac
[ -d "$FILES_DIR" ] || { echo "Patient files folder not found: $FILES_DIR" >&2; exit 1; }
mkdir -p "$BACKUP_DIR"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
suffix=""
[ -n "$RECIPIENT" ] && suffix=".age"
db="healixdz-db-$stamp.sql.gz$suffix"
files="healixdz-files-$stamp.tar.gz$suffix"

# The password goes through a private option file, never the command line.
options=$(mktemp)
cleanup() {
  rm -f "$options" "$BACKUP_DIR/$db.partial" "$BACKUP_DIR/$files.partial"
}
trap cleanup EXIT
chmod 600 "$options"
printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword=%s\n' \
  "$MYSQL_HOST" "$MYSQL_PORT" "$MYSQL_USER" "$MYSQL_PASSWORD" > "$options"

encrypt() {
  if [ -n "$RECIPIENT" ]; then
    age --recipient "$RECIPIENT"
  else
    cat
  fi
}

# Written under .partial, renamed once complete: a crash never leaves a
# truncated archive that looks valid.
finish() {
  mv "$BACKUP_DIR/$1.partial" "$BACKUP_DIR/$1"
  (cd "$BACKUP_DIR" && sha256sum "$1" > "$1.sha256")
  echo "  $1 ($(wc -c < "$BACKUP_DIR/$1") bytes)"
}

echo "HealixDz backup $stamp$([ -n "$RECIPIENT" ] && echo ' (encrypted with age)')"

# A consistent snapshot of InnoDB tables without locking the application.
mysqldump --defaults-extra-file="$options" \
  --single-transaction --quick --no-tablespaces --triggers \
  "$MYSQL_DATABASE" | gzip -6 | encrypt > "$BACKUP_DIR/$db.partial"
finish "$db"

tar -C "$FILES_DIR" -czf - . | encrypt > "$BACKUP_DIR/$files.partial"
finish "$files"

# Retention: archives and their checksums older than RETENTION_DAYS days.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'healixdz-*' \
  -mmin +$((RETENTION_DAYS * 24 * 60)) -print -delete \
  | sed 's/^/  removed (older than '"$RETENTION_DAYS"' days): /'

echo "Backup complete."
