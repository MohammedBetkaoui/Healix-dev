# syntax=docker/dockerfile:1

# HealixDz backups and restore. Build context: scripts/backup/.
# mysqldump and mysql come from the same MySQL release as the server; age
# (optional encryption) from its official release, pinned and checked.

# age, downloaded once, verified against the release's SHA-256.
FROM alpine:3.20 AS age
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
ARG TARGETARCH
ARG AGE_VERSION=1.3.2
ARG AGE_SHA256_AMD64=cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10
ARG AGE_SHA256_ARM64=6b8dc4333c53a5a57c9e5834e3a48f92605d7154014cd07269ff3327db5d37f4
RUN set -eu; \
    arch="${TARGETARCH:-amd64}"; \
    case "$arch" in \
      amd64) sum="$AGE_SHA256_AMD64" ;; \
      arm64) sum="$AGE_SHA256_ARM64" ;; \
      *) echo "Unsupported architecture: $arch" >&2; exit 1 ;; \
    esac; \
    wget -q -O /tmp/age.tar.gz \
      "https://github.com/FiloSottile/age/releases/download/v${AGE_VERSION}/age-v${AGE_VERSION}-linux-${arch}.tar.gz"; \
    echo "${sum}  /tmp/age.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/age.tar.gz -C /tmp; \
    install -m 0755 /tmp/age/age /usr/local/bin/age

FROM mysql:8.4
# gzip, tar, find for the archives; tzdata for BACKUP_TIME in local time.
RUN microdnf install -y gzip tar findutils tzdata \
 && microdnf clean all
COPY --from=age /usr/local/bin/age /usr/local/bin/age
COPY backup.sh /usr/local/bin/healixdz-backup
COPY restore.sh /usr/local/bin/healixdz-restore
COPY scheduler.sh /usr/local/bin/healixdz-backup-scheduler
# A Windows checkout may hold the scripts with CRLF line endings. The
# patient files folder belongs to uid 1000 (the backend's user): an empty
# volume first mounted here starts with that owner, so a restore into a
# brand-new stack can write it.
RUN sed -i 's/\r$//' /usr/local/bin/healixdz-* \
 && chmod 0755 /usr/local/bin/healixdz-* \
 && mkdir -p /data/patient-files /backups \
 && chown 1000:1000 /data/patient-files /backups
# Same uid as the backend, which owns the patient files.
USER 1000:1000
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=1 \
  CMD ["/bin/sh", "-c", "! grep -q '^failed' /tmp/healixdz-backup.status"]
# Not the MySQL server's entry point: this image only runs clients.
ENTRYPOINT []
CMD ["healixdz-backup-scheduler"]
