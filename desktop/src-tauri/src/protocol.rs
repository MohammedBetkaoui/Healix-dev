// Pure, testable pieces of the desktop protocol: the canonical signature
// string shared with the backend, body digesting, nonces and the local
// scope-reconciliation decision. No keyring, no database, no network here —
// `cargo test` exercises the rules without a system session.

use rand::{rngs::OsRng, RngCore};

// Must stay byte-for-byte in sync with
// backend/node: buildDeviceCanonicalString
// (backend/src/offline-devices/device-proof.ts) — a trailing newline keeps
// the six lines unambiguous.
// Wire-contract documentation: the field names, mirrored with the server;
// no runtime caller (the canonical string itself is built positionally).
#[allow(dead_code)]
pub const CANONICAL_HEADERS: [&str; 6] = [
    "METHOD",
    "PATH",
    "TIMESTAMP",
    "NONCE",
    "BODY_SHA256",
    "DEVICE_ID",
];

pub const DEVICE_ID_HEADER: &str = "X-Healix-Device-Id";
pub const DEVICE_TIMESTAMP_HEADER: &str = "X-Healix-Device-Timestamp";
pub const DEVICE_NONCE_HEADER: &str = "X-Healix-Device-Nonce";
pub const DEVICE_SIGNATURE_HEADER: &str = "X-Healix-Device-Signature";

// Frozen on both sides; checked by the backend's guard response wording.
#[allow(dead_code)]
pub const SIGNATURE_ALGORITHM: &str = "RSA-PSS-SHA256";

// Request timestamp tolerance, mirrored on the server side.
#[allow(dead_code)]
pub const TIMESTAMP_TOLERANCE_SECONDS: i64 = 300;

// SHA-256 of the empty body — what GET (and empty-body POST) requests sign.
pub const EMPTY_BODY_SHA256: &str =
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

pub fn canonical_request_string(
    method: &str,
    path: &str,
    timestamp_seconds: i64,
    nonce: &str,
    body_sha256: &str,
    device_id: &str,
) -> String {
    format!(
        "{}\n{}\n{}\n{}\n{}\n{}\n",
        method.to_ascii_uppercase(),
        path,
        timestamp_seconds,
        nonce,
        body_sha256,
        device_id
    )
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    let digest = <sha2::Sha256 as sha2::Digest>::digest(bytes);
    digest.iter().fold(String::with_capacity(64), |mut out, b| {
        let _ = write!(out, "{b:02x}");
        out
    })
}

// One random nonce per request; the backend stores it until the timestamp
// window closes, so a replayed request can never be accepted twice.
pub fn new_nonce() -> String {
    let mut bytes = [0u8; 16];
    OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

// Kept explicit (vs calling now_seconds inline) so tests can pin the
// freshness rule contractually without a clock.
#[allow(dead_code)]
pub fn fresh_timestamp(now_seconds: i64) -> i64 {
    now_seconds
}

// What the local reconciliation does with one cached patient the server no
// longer authorizes. Pending or conflicted local clinical data may NOT be
// destroyed silently: the folder is locked instead (explicit state), while a
// clean cache row is purged with everything that hangs on it.
#[derive(Debug, PartialEq, Eq)]
pub enum ScopeRemoval {
    Purge,
    Lock,
}

pub const SCOPE_REVOKED_LOCK_REASON: &str = "SCOPE_REVOKED_WITH_PENDING_DATA";

// Same explicit-state rule for a patient deleted globally while the desktop
// holds unsent clinical data for it.
pub const PATIENT_DELETED_LOCK_REASON: &str = "PATIENT_DELETED_WITH_PENDING_DATA";

pub fn decide_removal(has_pending: bool, has_conflict: bool) -> ScopeRemoval {
    if has_pending || has_conflict {
        ScopeRemoval::Lock
    } else {
        ScopeRemoval::Purge
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_string_matches_the_documented_format() {
        let canonical = canonical_request_string(
            "post",
            "/api/sync/push",
            1_793_221_200,
            "550e8400-e29b-41d4-a716-446655440000",
            "2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae",
            "device-cuid",
        );
        assert_eq!(
            canonical,
            "POST\n/api/sync/push\n1793221200\n550e8400-e29b-41d4-a716-446655440000\n2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae\ndevice-cuid\n"
        );
        assert_eq!(CANONICAL_HEADERS.len(), 6);
    }

    #[test]
    fn empty_body_hash_matches_sha256_of_zero_bytes() {
        assert_eq!(sha256_hex(&[]), EMPTY_BODY_SHA256);
    }

    #[test]
    fn body_hash_is_stable() {
        let body = br#"{"operations":[]}"#;
        assert_eq!(
            sha256_hex(body),
            "ba008b3ff2e64fd0f721e62a4159d1068da4c3f8ca432bf40a0414c167013059"
        );
    }

    #[test]
    fn nonce_is_hex_and_unique() {
        let first = new_nonce();
        let second = new_nonce();
        assert_eq!(first.len(), 32);
        assert!(first.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(first, second);
    }

    #[test]
    fn pending_or_conflicted_data_is_locked_not_purged() {
        assert_eq!(decide_removal(true, false), ScopeRemoval::Lock);
        assert_eq!(decide_removal(false, true), ScopeRemoval::Lock);
        assert_eq!(decide_removal(false, false), ScopeRemoval::Purge);
        assert_eq!(decide_removal(true, true), ScopeRemoval::Lock);
    }
}
