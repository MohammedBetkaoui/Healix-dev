#!/bin/bash
# One backup of HealixDz, in BACKUP_DIR:
#   healixdz-db-<UTC time>.sql.gz[.age]      mysqldump --single-transaction
#   healixdz-files-<UTC time>.tar.gz[.age]   the patient files volume
#   healixdz-orthanc-<UTC time>.tar.gz[.age] the Orthanc volume (DICOM studies)
# each with its SHA-256 next to it (<archive>.sha256, checkable with
# "sha256sum -c"). With BACKUP_AGE_RECIPIENT (an age public key), the
# archives are encrypted on the fly: no clear copy ever touches the disk.
# Then the backups older than BACKUP_RETENTION_DAYS are removed.
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-/backups}
FILES_DIR=${FILES_DIR:-/data/patient-files}
ORTHANC_DIR=${ORTHANC_DIR:-/data/orthanc}
# Seconds to wait before copying the Orthanc volume again (see archive_orthanc).
ORTHANC_RETRY_DELAY=${ORTHANC_RETRY_DELAY:-30}
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
[ -d "$ORTHANC_DIR" ] || { echo "Orthanc folder not found: $ORTHANC_DIR" >&2; exit 1; }
mkdir -p "$BACKUP_DIR"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
suffix=""
[ -n "$RECIPIENT" ] && suffix=".age"
db="healixdz-db-$stamp.sql.gz$suffix"
files="healixdz-files-$stamp.tar.gz$suffix"
orthanc="healixdz-orthanc-$stamp.tar.gz$suffix"

# The password goes through a private option file, never the command line.
options=$(mktemp)
cleanup() {
  rm -f "$options" "$BACKUP_DIR/$db.partial" "$BACKUP_DIR/$files.partial" \
    "$BACKUP_DIR/$orthanc.partial"
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

# The Orthanc volume holds the DICOM files (storage) and the index of the
# studies (index, a SQLite database). The Orthanc book warns that a copy of
# that index taken while Orthanc writes to it can be inconsistent: Orthanc
# assumes it is the only process to use it, and this container cannot stop it.
# Two precautions: the index is archived BEFORE the files, so that it never
# lists a file the archive lacks (a file with no entry is only an orphan); and
# if the index changes during the copy (or a journal shows a write in flight),
# the copy is made again.
orthanc_index_state() {
  find "$ORTHANC_DIR/index" -maxdepth 1 -type f -printf '%f %s %T@\n' 2> /dev/null | sort
}

archive_orthanc() {
  local members=() member attempt before after
  for member in index storage; do
    if [ -e "$ORTHANC_DIR/$member" ]; then
      members+=("$member")
    fi
  done
  # Orthanc has not created anything yet: an empty store is archived as such.
  if [ "${#members[@]}" -eq 0 ]; then
    members=(.)
  fi

  for attempt in 1 2 3; do
    before=$(orthanc_index_state)
    tar --numeric-owner -C "$ORTHANC_DIR" -czf - "${members[@]}" | encrypt > "$BACKUP_DIR/$orthanc.partial"
    after=$(orthanc_index_state)
    if [ "$before" = "$after" ] && ! grep -Eq '^[^ ]+-(journal|wal) ' <<< "$after"; then
      return 0
    fi
    echo "  Orthanc wrote to its index during the copy (attempt $attempt of 3)." >&2
    if [ "$attempt" -lt 3 ]; then
      sleep "$ORTHANC_RETRY_DELAY"
    fi
  done
  echo "  WARNING: $orthanc may hold an inconsistent index. Run another backup while no study is being imported." >&2
}

archive_orthanc
finish "$orthanc"

# Retention: archives and their checksums older than RETENTION_DAYS days.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'healixdz-*' \
  -mmin +$((RETENTION_DAYS * 24 * 60)) -print -delete \
  | sed 's/^/  removed (older than '"$RETENTION_DAYS"' days): /'

echo "Backup complete."
