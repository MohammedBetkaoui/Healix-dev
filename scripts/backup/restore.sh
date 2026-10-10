#!/bin/bash
# Restores one HealixDz backup: the database, then the patient files.
#
#   restore.sh [--force] <healixdz-db-….sql.gz[.age]> <healixdz-files-….tar.gz[.age]>
#
# Archive names are read from BACKUP_DIR unless given as paths. Before
# anything is written, both archives are checked against their .sha256 and
# read through entirely (decrypted with the age identity file when they end
# in .age). Meant for an empty stack: it stops if the database already has
# tables or the files volume is not empty, unless --force (then both are
# replaced). Stop the backend before restoring.
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-/backups}
FILES_DIR=${FILES_DIR:-/data/patient-files}
IDENTITY=${BACKUP_AGE_IDENTITY_FILE:-/run/age/identity}
MYSQL_HOST=${MYSQL_HOST:-mysql}
MYSQL_PORT=${MYSQL_PORT:-3306}
: "${MYSQL_DATABASE:?MYSQL_DATABASE is required}"
: "${MYSQL_USER:?MYSQL_USER is required}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD is required}"

force=false
if [ "${1:-}" = "--force" ]; then
  force=true
  shift
fi
if [ "$#" -ne 2 ]; then
  echo "Usage: restore.sh [--force] <database archive> <files archive>" >&2
  exit 2
fi

resolve() {
  case "$1" in
    */*) printf '%s' "$1" ;;
    *) printf '%s/%s' "$BACKUP_DIR" "$1" ;;
  esac
}
db=$(resolve "$1")
files=$(resolve "$2")

options=$(mktemp)
trap 'rm -f "$options"' EXIT
chmod 600 "$options"
printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword=%s\n' \
  "$MYSQL_HOST" "$MYSQL_PORT" "$MYSQL_USER" "$MYSQL_PASSWORD" > "$options"

decrypt() {
  case "$1" in
    *.age)
      [ -r "$IDENTITY" ] || { echo "Encrypted archive: age identity file not found ($IDENTITY)." >&2; return 1; }
      age --decrypt --identity "$IDENTITY" "$1"
      ;;
    *) cat "$1" ;;
  esac
}

case "$db $files" in
  *.age*)
    if [ ! -r "$IDENTITY" ]; then
      echo "Encrypted backup: mount the age private key at $IDENTITY (see DEPLOIEMENT.md). Nothing written." >&2
      exit 1
    fi
    ;;
esac

echo "1/4 Checksums"
for archive in "$db" "$files"; do
  [ -f "$archive" ] || { echo "Not found: $archive" >&2; exit 1; }
  [ -f "$archive.sha256" ] || { echo "Checksum file missing: $archive.sha256" >&2; exit 1; }
  (cd "$(dirname "$archive")" && sha256sum -c "$(basename "$archive").sha256")
done

echo "2/4 Archives readable"
decrypt "$db" | gzip -t
decrypt "$files" | tar -tzf - > /dev/null
echo "  both archives decompress completely"

echo "3/4 Targets"
tables=$(mysql --defaults-extra-file="$options" --batch --skip-column-names \
  -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()" \
  "$MYSQL_DATABASE")
[ -d "$FILES_DIR" ] || { echo "Patient files folder not found: $FILES_DIR" >&2; exit 1; }
existing_files=$(find "$FILES_DIR" -mindepth 1 -maxdepth 1 | head -n 1)
if ! $force && { [ "$tables" -gt 0 ] || [ -n "$existing_files" ]; }; then
  echo "The database has $tables table(s) and the files volume is $([ -n "$existing_files" ] && echo 'not empty' || echo 'empty')." >&2
  echo "Nothing written. Restore into an empty stack, or add --force to replace them." >&2
  exit 1
fi
echo "  database: $tables table(s) before restore; files volume: $([ -n "$existing_files" ] && echo 'replaced (--force)' || echo 'empty')"

echo "4/4 Restore"
# The dump drops and recreates each table it contains.
decrypt "$db" | gunzip | mysql --defaults-extra-file="$options" "$MYSQL_DATABASE"
echo "  database restored"
if [ -n "$existing_files" ]; then
  find "$FILES_DIR" -mindepth 1 -delete
fi
decrypt "$files" | tar -C "$FILES_DIR" -xzf -
echo "  patient files restored ($(find "$FILES_DIR" -type f | wc -l) files)"

echo "Restore complete. Start the stack: docker compose up -d"
