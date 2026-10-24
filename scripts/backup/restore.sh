#!/bin/bash
# Restores one HealixDz backup: the database, then the patient files, then
# the Orthanc volume (DICOM studies).
#
#   restore.sh [--force] <healixdz-db-….sql.gz[.age]> <healixdz-files-….tar.gz[.age]> [<healixdz-orthanc-….tar.gz[.age]>]
#
# The Orthanc archive is optional: without it (a backup made before the DICOM
# import existed) the Orthanc volume is left alone. Archive names are read
# from BACKUP_DIR unless given as paths. Before anything is written, the
# archives are checked against their .sha256 and read through entirely
# (decrypted with the age identity file when they end in .age). Meant for an
# empty stack: it stops if the database already has tables or a volume is not
# empty, unless --force (then they are replaced). Stop the backend and Orthanc
# before restoring. Run as root, so that tar gives each file back the owner
# recorded in the archive (uid 1000 for the patient files, 999 for Orthanc).
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-/backups}
FILES_DIR=${FILES_DIR:-/data/patient-files}
ORTHANC_DIR=${ORTHANC_DIR:-/data/orthanc}
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
if [ "$#" -ne 2 ] && [ "$#" -ne 3 ]; then
  echo "Usage: restore.sh [--force] <database archive> <files archive> [<orthanc archive>]" >&2
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
orthanc=""
if [ "$#" -eq 3 ]; then
  orthanc=$(resolve "$3")
fi
archives=("$db" "$files")
if [ -n "$orthanc" ]; then
  archives+=("$orthanc")
fi

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

case "$db $files $orthanc" in
  *.age*)
    if [ ! -r "$IDENTITY" ]; then
      echo "Encrypted backup: mount the age private key at $IDENTITY (see DEPLOIEMENT.md). Nothing written." >&2
      exit 1
    fi
    ;;
esac

echo "1/4 Checksums"
for archive in "${archives[@]}"; do
  [ -f "$archive" ] || { echo "Not found: $archive" >&2; exit 1; }
  [ -f "$archive.sha256" ] || { echo "Checksum file missing: $archive.sha256" >&2; exit 1; }
  (cd "$(dirname "$archive")" && sha256sum -c "$(basename "$archive").sha256")
done

echo "2/4 Archives readable"
decrypt "$db" | gzip -t
decrypt "$files" | tar -tzf - > /dev/null
if [ -n "$orthanc" ]; then
  decrypt "$orthanc" | tar -tzf - > /dev/null
fi
echo "  all the archives decompress completely"

echo "3/4 Targets"
tables=$(mysql --defaults-extra-file="$options" --batch --skip-column-names \
  -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()" \
  "$MYSQL_DATABASE")
[ -d "$FILES_DIR" ] || { echo "Patient files folder not found: $FILES_DIR" >&2; exit 1; }
existing_files=$(find "$FILES_DIR" -mindepth 1 -maxdepth 1 | head -n 1)
existing_orthanc=""
if [ -n "$orthanc" ]; then
  [ -d "$ORTHANC_DIR" ] || { echo "Orthanc folder not found: $ORTHANC_DIR" >&2; exit 1; }
  existing_orthanc=$(find "$ORTHANC_DIR" -mindepth 1 -maxdepth 1 | head -n 1)
fi
if ! $force && { [ "$tables" -gt 0 ] || [ -n "$existing_files" ] || [ -n "$existing_orthanc" ]; }; then
  echo "The database has $tables table(s), the files volume is $([ -n "$existing_files" ] && echo 'not empty' || echo 'empty')$([ -n "$orthanc" ] && echo " and the Orthanc volume is $([ -n "$existing_orthanc" ] && echo 'not empty' || echo 'empty')")." >&2
  echo "Nothing written. Restore into an empty stack, or add --force to replace them." >&2
  exit 1
fi
echo "  database: $tables table(s) before restore; files volume: $([ -n "$existing_files" ] && echo 'replaced (--force)' || echo 'empty')$([ -n "$orthanc" ] && echo "; Orthanc volume: $([ -n "$existing_orthanc" ] && echo 'replaced (--force)' || echo 'empty')")"

echo "4/4 Restore"
# The dump drops and recreates each table it contains.
decrypt "$db" | gunzip | mysql --defaults-extra-file="$options" "$MYSQL_DATABASE"
echo "  database restored"
if [ -n "$existing_files" ]; then
  find "$FILES_DIR" -mindepth 1 -delete
fi
decrypt "$files" | tar --numeric-owner -C "$FILES_DIR" -xzf -
echo "  patient files restored ($(find "$FILES_DIR" -type f | wc -l) files)"
if [ -n "$orthanc" ]; then
  if [ -n "$existing_orthanc" ]; then
    find "$ORTHANC_DIR" -mindepth 1 -delete
  fi
  decrypt "$orthanc" | tar --numeric-owner -C "$ORTHANC_DIR" -xzf -
  echo "  Orthanc volume restored ($(find "$ORTHANC_DIR" -type f | wc -l) files)"
fi

if [ -z "$orthanc" ]; then
  echo "No Orthanc archive given: the Orthanc volume was not touched."
fi
echo "Restore complete. Start the stack: docker compose up -d"
