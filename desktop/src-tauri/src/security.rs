use base64::{engine::general_purpose::STANDARD, Engine};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use keyring::Entry;
use rand::{rngs::OsRng, RngCore};
use rsa::pss::SigningKey;
use rsa::signature::{RandomizedSigner, SignatureEncoding};
use rsa::{
    pkcs8::{DecodePrivateKey, EncodePrivateKey, EncodePublicKey, LineEnding},
    RsaPrivateKey, RsaPublicKey,
};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use uuid::Uuid;

use crate::protocol::{
    canonical_request_string, new_nonce, DEVICE_ID_HEADER, DEVICE_NONCE_HEADER,
    DEVICE_SIGNATURE_HEADER, DEVICE_TIMESTAMP_HEADER,
};

pub struct SignedRequest {
    pub device_id: String,
    pub timestamp: i64,
    pub nonce: String,
    pub signature: String,
}

// The service of the secrets of an installed HealixDz Desktop. Unit tests that
// reach the real Credential Manager use another one, so that they can never
// read or erase a secret of an installed application.
#[cfg(not(test))]
const SERVICE: &str = "dz.healix.desktop";
#[cfg(test)]
const SERVICE: &str = "dz.healix.desktop.test";
// Windows Credential Manager limits the credential blob to 2,560 bytes.
// `keyring` encodes passwords as UTF-16, so the effective maximum is 1,280
// code units. Keep a margin: the parts remain in Credential Manager, never
// in a plaintext file or in the SQLCipher database.
const KEYRING_CHUNK_UTF16_LIMIT: usize = 1_200;
const MAX_KEYRING_CHUNKS: usize = 128;
const CHUNK_MANIFEST_SUFFIX: &str = "-chunk-manifest-v1";
const INVALID_MANIFEST: &str = "Manifest du secret local fragmenté invalide dans le Gestionnaire d’informations d’identification Windows.";
const INCOMPLETE_SECRET: &str = "Secret local fragmenté incomplet dans le Gestionnaire d’informations d’identification Windows.";

// A long secret lives in one of two chunk sets, named after the slot. A new
// version is written into the slot the manifest does not point at, and the
// manifest then switches to it: the previous version stays complete and
// readable until that single write, so an interrupted write can never leave a
// mix of old and new parts. Slot A keeps the names and the manifest format of
// the first release (`<name>-chunk-v1-<i>`, manifest `<count>`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Slot {
    A,
    B,
}

impl Slot {
    fn other(self) -> Slot {
        match self {
            Slot::A => Slot::B,
            Slot::B => Slot::A,
        }
    }

    fn marker(self) -> &'static str {
        match self {
            Slot::A => "chunk-v1",
            Slot::B => "chunk-v1b",
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
enum Manifest {
    Absent,
    Valid(Slot, usize),
    Invalid,
}

fn manifest_name(name: &str) -> String {
    format!("{name}{CHUNK_MANIFEST_SUFFIX}")
}

fn chunk_name(name: &str, slot: Slot, index: usize) -> String {
    format!("{name}-{}-{index}", slot.marker())
}

fn format_manifest(slot: Slot, count: usize) -> String {
    match slot {
        Slot::A => count.to_string(),
        Slot::B => format!("b:{count}"),
    }
}

// Strict: digits only, 1..=MAX_KEYRING_CHUNKS chunks, nothing else.
fn parse_manifest(raw: &str) -> Option<(Slot, usize)> {
    let (slot, digits) = match raw.strip_prefix("b:") {
        Some(rest) => (Slot::B, rest),
        None => (Slot::A, raw),
    };
    if digits.is_empty() || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let count = digits.parse::<usize>().ok()?;
    (1..=MAX_KEYRING_CHUNKS)
        .contains(&count)
        .then_some((slot, count))
}

fn entry(name: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, name).map_err(|error| {
        format!("Coffre-fort système indisponible pour ce compte Windows ({error}).")
    })
}

pub fn set_secret(name: &str, value: &str) -> Result<(), String> {
    let chunks = split_secret(value);
    // Refused before anything is written: a manifest announcing more parts
    // than a read accepts would make the secret unreadable.
    if chunks.len() > MAX_KEYRING_CHUNKS {
        return Err(
            "Secret local trop volumineux pour le Gestionnaire d’informations d’identification Windows."
                .to_string(),
        );
    }
    let previous = read_manifest(name)?;

    if chunks.len() == 1 {
        // The credential is written before the manifest is removed: until
        // then the previous chunk set, still complete, is what a read returns.
        set_entry_secret(name, value)?;
        delete_entry_secret(&manifest_name(name));
        if previous != Manifest::Absent {
            delete_all_chunks(name);
        }
        return Ok(());
    }

    // Write the parts into the unused slot before publishing them with the
    // manifest. If a write is interrupted, the previous version (a plain
    // credential or the other slot) remains readable and unchanged. A corrupt
    // manifest is repaired by this write.
    let target = match previous {
        Manifest::Valid(slot, _) => slot.other(),
        Manifest::Absent | Manifest::Invalid => Slot::A,
    };
    for (index, chunk) in chunks.iter().enumerate() {
        set_entry_secret(&chunk_name(name, target, index), chunk)?;
    }
    set_entry_secret(&manifest_name(name), &format_manifest(target, chunks.len()))?;
    // Published. Whatever the manifest no longer references is removed: the
    // plain credential, the previous slot, and parts left by an interrupted
    // earlier write.
    delete_entry_secret(name);
    delete_chunks(name, target, chunks.len()..MAX_KEYRING_CHUNKS);
    delete_chunks(name, target.other(), 0..MAX_KEYRING_CHUNKS);
    Ok(())
}

pub fn get_secret(name: &str) -> Result<String, String> {
    get_optional_secret(name)?.ok_or_else(|| "Session offline absente ou verrouillée.".to_string())
}

fn get_optional_secret(name: &str) -> Result<Option<String>, String> {
    match read_manifest(name)? {
        Manifest::Valid(slot, count) => {
            let mut value = String::new();
            for index in 0..count {
                // A missing part is an error: the remaining parts are never
                // concatenated into a secret that looks complete.
                let part = get_entry_secret(&chunk_name(name, slot, index))?
                    .ok_or_else(|| INCOMPLETE_SECRET.to_string())?;
                value.push_str(&part);
            }
            Ok(Some(value))
        }
        Manifest::Invalid => Err(INVALID_MANIFEST.to_string()),
        Manifest::Absent => get_entry_secret(name),
    }
}

fn get_entry_secret(name: &str) -> Result<Option<String>, String> {
    if file_vault::active() {
        return file_vault::get(name);
    }
    match entry(name)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!(
            "Coffre-fort système indisponible pour ce compte Windows ({error})."
        )),
    }
}

fn delete_entry_secret(name: &str) {
    if file_vault::active() {
        file_vault::delete(name);
    } else if let Ok(item) = entry(name) {
        let _ = item.delete_credential();
    }
}

fn set_entry_secret(name: &str, value: &str) -> Result<(), String> {
    if file_vault::active() {
        return file_vault::set(name, value);
    }
    entry(name)?.set_password(value).map_err(|error| {
        format!(
            "Impossible de protéger le secret local dans le Gestionnaire d’informations d’identification Windows ({error})."
        )
    })
}

fn read_manifest(name: &str) -> Result<Manifest, String> {
    Ok(match get_entry_secret(&manifest_name(name))? {
        None => Manifest::Absent,
        Some(raw) => match parse_manifest(&raw) {
            Some((slot, count)) => Manifest::Valid(slot, count),
            None => Manifest::Invalid,
        },
    })
}

fn split_secret(value: &str) -> Vec<String> {
    if value.encode_utf16().count() <= KEYRING_CHUNK_UTF16_LIMIT {
        return vec![value.to_string()];
    }

    let mut chunks = Vec::new();
    let mut current = String::new();
    let mut current_utf16_units = 0;
    for character in value.chars() {
        let character_utf16_units = character.len_utf16();
        if current_utf16_units + character_utf16_units > KEYRING_CHUNK_UTF16_LIMIT {
            chunks.push(std::mem::take(&mut current));
            current_utf16_units = 0;
        }
        current.push(character);
        current_utf16_units += character_utf16_units;
    }
    if !current.is_empty() {
        chunks.push(current);
    }
    chunks
}

fn delete_chunks(name: &str, slot: Slot, indexes: std::ops::Range<usize>) {
    for index in indexes {
        delete_entry_secret(&chunk_name(name, slot, index));
    }
}

fn delete_all_chunks(name: &str) {
    delete_chunks(name, Slot::A, 0..MAX_KEYRING_CHUNKS);
    delete_chunks(name, Slot::B, 0..MAX_KEYRING_CHUNKS);
}

// Removes the credential, its manifest and every part. The parts are swept by
// index range, never by the count the manifest announces: a manifest that is
// missing or corrupt cannot leave fragments of the secret in the vault, and
// the manifest is not needed to know what to remove.
pub fn delete_secret(name: &str) {
    delete_entry_secret(name);
    delete_entry_secret(&manifest_name(name));
    delete_all_chunks(name);
}

pub fn database_key() -> Result<Vec<u8>, String> {
    if let Some(encoded) = get_optional_secret("database-key-v1")? {
        return STANDARD
            .decode(encoded)
            .map_err(|_| "Clé locale corrompue.".to_string());
    }
    let mut key = vec![0u8; 32];
    OsRng.fill_bytes(&mut key);
    set_secret("database-key-v1", &STANDARD.encode(&key))?;
    Ok(key)
}

pub fn device_identity() -> Result<(String, String), String> {
    let installation_id = match get_optional_secret("installation-id")? {
        Some(value) => value,
        None => {
            let value = Uuid::new_v4().to_string();
            set_secret("installation-id", &value)?;
            value
        }
    };
    let private_pem = match get_optional_secret("device-private-key")? {
        Some(value) => value,
        None => {
            let key = RsaPrivateKey::new(&mut OsRng, 2048)
                .map_err(|_| "Impossible de créer l’identité cryptographique.".to_string())?;
            let pem = key
                .to_pkcs8_pem(LineEnding::LF)
                .map_err(|_| "Impossible d’encoder la clé privée.".to_string())?
                .to_string();
            set_secret("device-private-key", &pem)?;
            pem
        }
    };
    let private_key = RsaPrivateKey::from_pkcs8_pem(&private_pem)
        .map_err(|_| "Identité cryptographique locale invalide.".to_string())?;
    let public_pem = RsaPublicKey::from(&private_key)
        .to_public_key_pem(LineEnding::LF)
        .map_err(|_| "Impossible d’encoder la clé publique.".to_string())?;
    Ok((installation_id, public_pem))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrantClaims {
    pub token_type: String,
    pub grant_id: String,
    pub user_id: String,
    pub device_id: String,
    pub workspace_id: String,
    pub role: String,
    pub exp: usize,
    pub iat: usize,
    pub iss: String,
    pub aud: String,
}

pub fn store_grant(token: &str, public_key: &str) -> Result<(), String> {
    set_secret("offline-grant", token)?;
    set_secret("grant-public-key", public_key)
}

pub fn verified_grant() -> Result<(String, GrantClaims), String> {
    let token = get_secret("offline-grant")?;
    let public_key = get_secret("grant-public-key")?;
    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_audience(&["healixdz-desktop"]);
    validation.set_issuer(&["healixdz-api"]);
    validation.validate_exp = true;
    let claims = decode::<GrantClaims>(
        &token,
        &DecodingKey::from_rsa_pem(public_key.as_bytes())
            .map_err(|_| "Clé de vérification offline invalide.".to_string())?,
        &validation,
    )
    .map_err(|_| "Autorisation offline expirée ou invalide.".to_string())?
    .claims;
    if claims.token_type != "offline-grant" {
        return Err("Type d’autorisation offline invalide.".to_string());
    }
    Ok((token, claims))
}

pub fn clear_session() {
    delete_secret("offline-grant");
    delete_secret("grant-public-key");
}

// Proof-of-possession: build the canonical string shared with the backend,
// sign it with the device private key (RSA-PSS / SHA-256) and return the
// headers every /sync/* request carries next to the Bearer grant. The
// private key never leaves the OS secure store and its bytes never appear
// in a log, a SQLite row or an API response.
pub fn sign_request(
    method: &str,
    path: &str,
    body_sha256: &str,
    device_id: &str,
) -> Result<SignedRequest, String> {
    let private_pem = get_secret("device-private-key")?;
    let key = RsaPrivateKey::from_pkcs8_pem(&private_pem)
        .map_err(|_| "Identité cryptographique locale invalide.".to_string())?;
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .map_err(|_| "Horloge système invalide.".to_string())?;
    let nonce = new_nonce();
    let canonical =
        canonical_request_string(method, path, timestamp, &nonce, body_sha256, device_id);
    let signing_key = SigningKey::<Sha256>::new(key);
    let signature = signing_key
        .sign_with_rng(&mut OsRng, canonical.as_bytes())
        .to_vec();
    Ok(SignedRequest {
        device_id: device_id.to_string(),
        timestamp,
        nonce,
        signature: STANDARD.encode(signature),
    })
}

pub fn signed_request_headers(
    method: &str,
    path: &str,
    body_sha256: &str,
    device_id: &str,
) -> Result<Vec<(&'static str, String)>, String> {
    let signed = sign_request(method, path, body_sha256, device_id)?;
    Ok(vec![
        (DEVICE_ID_HEADER, signed.device_id),
        (DEVICE_TIMESTAMP_HEADER, signed.timestamp.to_string()),
        (DEVICE_NONCE_HEADER, signed.nonce),
        (DEVICE_SIGNATURE_HEADER, signed.signature),
    ])
}

// Secrets in a plain folder, for the offline reliability harness only: the
// feature is off in every shipped build, where the secrets stay in the OS
// credential vault. Selected by HEALIX_E2E_SECRET_DIR; one file per secret.
#[cfg(all(feature = "e2e-harness", not(test)))]
mod file_vault {
    use std::{fs, path::PathBuf};

    fn dir() -> Option<PathBuf> {
        std::env::var_os("HEALIX_E2E_SECRET_DIR").map(PathBuf::from)
    }

    pub fn active() -> bool {
        dir().is_some()
    }

    fn file(name: &str) -> Result<PathBuf, String> {
        let directory = dir().ok_or_else(|| "Coffre de test absent.".to_string())?;
        fs::create_dir_all(&directory).map_err(|_| "Coffre de test inaccessible.".to_string())?;
        Ok(directory.join(format!("{name}.secret")))
    }

    pub fn get(name: &str) -> Result<Option<String>, String> {
        match fs::read_to_string(file(name)?) {
            Ok(value) => Ok(Some(value)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(_) => Err("Coffre de test illisible.".to_string()),
        }
    }

    pub fn set(name: &str, value: &str) -> Result<(), String> {
        fs::write(file(name)?, value).map_err(|_| "Coffre de test non écrit.".to_string())
    }

    pub fn delete(name: &str) {
        if let Ok(path) = file(name) {
            let _ = fs::remove_file(path);
        }
    }
}

#[cfg(all(not(feature = "e2e-harness"), not(test)))]
mod file_vault {
    pub fn active() -> bool {
        false
    }

    pub fn get(_name: &str) -> Result<Option<String>, String> {
        Ok(None)
    }

    pub fn set(_name: &str, _value: &str) -> Result<(), String> {
        Ok(())
    }

    pub fn delete(_name: &str) {}
}

// In-memory stand-in for the vault in unit tests. One vault per test thread,
// installed by `TestVault`: the tests stay independent, and a test that does
// not install it reaches the real Credential Manager (see
// `real_credential_manager`). It can fail a write after N successful ones to
// reproduce a process interrupted in the middle of `set_secret`.
#[cfg(test)]
mod file_vault {
    use std::{cell::RefCell, collections::BTreeMap};

    #[derive(Default)]
    struct State {
        entries: BTreeMap<String, String>,
        writes_left: Option<usize>,
    }

    thread_local! {
        static VAULT: RefCell<Option<State>> = const { RefCell::new(None) };
    }

    pub fn install() {
        VAULT.with(|vault| *vault.borrow_mut() = Some(State::default()));
    }

    pub fn uninstall() {
        VAULT.with(|vault| *vault.borrow_mut() = None);
    }

    pub fn active() -> bool {
        VAULT.with(|vault| vault.borrow().is_some())
    }

    pub fn get(name: &str) -> Result<Option<String>, String> {
        Ok(VAULT.with(|vault| {
            vault
                .borrow()
                .as_ref()
                .and_then(|state| state.entries.get(name).cloned())
        }))
    }

    pub fn set(name: &str, value: &str) -> Result<(), String> {
        VAULT.with(|vault| {
            let mut guard = vault.borrow_mut();
            let state = guard
                .as_mut()
                .ok_or_else(|| "Coffre de test absent.".to_string())?;
            if let Some(left) = state.writes_left.as_mut() {
                if *left == 0 {
                    return Err("Écriture interrompue (test).".to_string());
                }
                *left -= 1;
            }
            state.entries.insert(name.to_string(), value.to_string());
            Ok(())
        })
    }

    pub fn delete(name: &str) {
        VAULT.with(|vault| {
            if let Some(state) = vault.borrow_mut().as_mut() {
                state.entries.remove(name);
            }
        });
    }

    // Test controls.
    pub fn names() -> Vec<String> {
        VAULT.with(|vault| {
            vault
                .borrow()
                .as_ref()
                .map(|state| state.entries.keys().cloned().collect())
                .unwrap_or_default()
        })
    }

    pub fn raw_set(name: &str, value: &str) {
        VAULT.with(|vault| {
            if let Some(state) = vault.borrow_mut().as_mut() {
                state.entries.insert(name.to_string(), value.to_string());
            }
        });
    }

    pub fn fail_after_writes(writes: usize) {
        VAULT.with(|vault| {
            if let Some(state) = vault.borrow_mut().as_mut() {
                state.writes_left = Some(writes);
            }
        });
    }

    pub fn stop_failing() {
        VAULT.with(|vault| {
            if let Some(state) = vault.borrow_mut().as_mut() {
                state.writes_left = None;
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NAME: &str = "synthetic-secret";

    struct TestVault;

    impl TestVault {
        fn new() -> Self {
            file_vault::install();
            TestVault
        }
    }

    impl Drop for TestVault {
        fn drop(&mut self) {
            file_vault::uninstall();
        }
    }

    fn sorted(mut names: Vec<String>) -> Vec<String> {
        names.sort();
        names
    }

    fn stored() -> Vec<String> {
        sorted(file_vault::names())
    }

    fn only_credential() -> Vec<String> {
        vec![NAME.to_string()]
    }

    // The manifest and the parts of a secret held in `slot`.
    fn chunked(slot: Slot, count: usize) -> Vec<String> {
        let mut names = vec![manifest_name(NAME)];
        names.extend((0..count).map(|index| chunk_name(NAME, slot, index)));
        sorted(names)
    }

    fn manifest() -> Option<String> {
        file_vault::get(&manifest_name(NAME)).unwrap()
    }

    fn secret(units: usize, filler: char) -> String {
        std::iter::repeat_n(filler, units).collect()
    }

    #[test]
    fn chunks_long_secrets_without_splitting_utf8_characters() {
        let value = format!("{}😀{}", "a".repeat(2_399), "b".repeat(2_400));
        let chunks = split_secret(&value);

        assert_eq!(chunks.concat(), value);
        assert!(chunks.len() > 1);
        assert!(chunks
            .iter()
            .all(|chunk| chunk.encode_utf16().count() <= KEYRING_CHUNK_UTF16_LIMIT));
    }

    #[test]
    fn manifests_are_parsed_strictly() {
        assert_eq!(parse_manifest("1"), Some((Slot::A, 1)));
        assert_eq!(parse_manifest("128"), Some((Slot::A, 128)));
        assert_eq!(parse_manifest("b:7"), Some((Slot::B, 7)));
        for invalid in [
            "",
            "0",
            "129",
            "-1",
            "+3",
            " 3",
            "3 ",
            "3.0",
            "b:",
            "b:0",
            "b:129",
            "b:x",
            "not-a-number",
            "B:3",
            "b: 3",
            "99999999999999999999999",
        ] {
            assert_eq!(parse_manifest(invalid), None, "{invalid:?}");
        }
        assert_eq!(
            parse_manifest(&format_manifest(Slot::A, 5)),
            Some((Slot::A, 5))
        );
        assert_eq!(
            parse_manifest(&format_manifest(Slot::B, 5)),
            Some((Slot::B, 5))
        );
    }

    #[test]
    fn a_short_secret_is_a_single_credential() {
        let _vault = TestVault::new();
        set_secret(NAME, "short").unwrap();

        assert_eq!(stored(), only_credential());
        assert_eq!(get_secret(NAME).unwrap(), "short");
    }

    #[test]
    fn a_secret_of_exactly_the_limit_is_not_chunked_and_one_unit_more_is() {
        let _vault = TestVault::new();
        let at_limit = secret(KEYRING_CHUNK_UTF16_LIMIT, 'a');
        set_secret(NAME, &at_limit).unwrap();
        assert_eq!(stored(), only_credential());
        assert_eq!(get_secret(NAME).unwrap(), at_limit);

        let over_limit = secret(KEYRING_CHUNK_UTF16_LIMIT + 1, 'b');
        set_secret(NAME, &over_limit).unwrap();
        assert_eq!(stored(), chunked(Slot::A, 2));
        assert_eq!(get_secret(NAME).unwrap(), over_limit);
    }

    #[test]
    fn a_long_secret_is_split_into_chunks_and_rebuilt_exactly() {
        let _vault = TestVault::new();
        let value = format!(
            "{}{}{}",
            secret(1_200, 'a'),
            secret(1_200, 'b'),
            secret(500, 'c')
        );
        set_secret(NAME, &value).unwrap();

        assert_eq!(manifest().as_deref(), Some("3"));
        assert_eq!(stored(), chunked(Slot::A, 3));
        assert_eq!(get_secret(NAME).unwrap(), value);
    }

    #[test]
    fn unicode_secrets_survive_chunking_at_every_boundary() {
        let _vault = TestVault::new();
        let values = [
            // A surrogate pair straddling the first boundary.
            format!("{}😀{}", secret(1_199, 'a'), secret(1_500, 'b')),
            format!("{}😀{}", secret(1_198, 'a'), secret(1_500, 'b')),
            "مرحبا بالعالم ".repeat(400),
            "éàùçœ—’".repeat(700),
            format!("{}é{}", secret(1_199, 'x'), "日本語".repeat(900)),
        ];
        for value in values {
            set_secret(NAME, &value).unwrap();
            assert_eq!(get_secret(NAME).unwrap(), value);
        }
    }

    #[test]
    fn a_secret_needing_more_chunks_than_allowed_is_refused_before_any_write() {
        let _vault = TestVault::new();
        set_secret(NAME, "kept").unwrap();

        let largest = secret(MAX_KEYRING_CHUNKS * KEYRING_CHUNK_UTF16_LIMIT, 'a');
        set_secret(NAME, &largest).unwrap();
        assert_eq!(get_secret(NAME).unwrap(), largest);

        set_secret(NAME, "kept").unwrap();
        let too_large = secret(MAX_KEYRING_CHUNKS * KEYRING_CHUNK_UTF16_LIMIT + 1, 'a');
        assert!(set_secret(NAME, &too_large).is_err());
        assert_eq!(stored(), only_credential());
        assert_eq!(get_secret(NAME).unwrap(), "kept");
    }

    #[test]
    fn overwriting_a_long_secret_with_a_shorter_one_removes_the_obsolete_parts() {
        let _vault = TestVault::new();
        let first = secret(4_500, 'a');
        let second = secret(2_000, 'b');
        let third = secret(3_000, 'c');

        set_secret(NAME, &first).unwrap();
        assert_eq!(stored(), chunked(Slot::A, 4));

        set_secret(NAME, &second).unwrap();
        assert_eq!(manifest().as_deref(), Some("b:2"));
        assert_eq!(stored(), chunked(Slot::B, 2));
        assert_eq!(get_secret(NAME).unwrap(), second);

        set_secret(NAME, &third).unwrap();
        assert_eq!(manifest().as_deref(), Some("3"));
        assert_eq!(stored(), chunked(Slot::A, 3));
        assert_eq!(get_secret(NAME).unwrap(), third);
    }

    #[test]
    fn overwriting_a_long_secret_with_a_short_one_removes_the_manifest_and_every_part() {
        let _vault = TestVault::new();
        set_secret(NAME, &secret(4_000, 'a')).unwrap();
        set_secret(NAME, &secret(2_000, 'b')).unwrap();
        assert_eq!(stored(), chunked(Slot::B, 2));

        set_secret(NAME, "short").unwrap();

        assert_eq!(stored(), only_credential());
        assert_eq!(get_secret(NAME).unwrap(), "short");
    }

    #[test]
    fn a_secret_moves_between_short_and_long_without_leaving_the_other_form() {
        let _vault = TestVault::new();
        set_secret(NAME, "short").unwrap();
        set_secret(NAME, &secret(2_500, 'a')).unwrap();
        assert_eq!(stored(), chunked(Slot::A, 3));
        set_secret(NAME, "short again").unwrap();
        assert_eq!(stored(), only_credential());
        assert_eq!(get_secret(NAME).unwrap(), "short again");
    }

    #[test]
    fn deleting_removes_the_credential_the_manifest_and_every_part() {
        let _vault = TestVault::new();
        // Regression: the parts are removed even though the manifest that
        // announces them is deleted as part of the same operation.
        set_secret(NAME, &secret(4_000, 'a')).unwrap();
        set_secret(NAME, &secret(2_500, 'b')).unwrap();
        assert!(stored().len() > 1);
        delete_secret(NAME);
        assert!(stored().is_empty());

        set_secret(NAME, "short").unwrap();
        delete_secret(NAME);
        assert!(stored().is_empty());
        assert!(get_secret(NAME).is_err());
    }

    #[test]
    fn deleting_one_secret_leaves_the_others_untouched() {
        let _vault = TestVault::new();
        let other = secret(3_000, 'o');
        set_secret("other-secret", &other).unwrap();
        set_secret("other-secret-2", "kept").unwrap();
        set_secret(NAME, &secret(3_000, 'a')).unwrap();

        delete_secret(NAME);

        assert_eq!(get_secret("other-secret").unwrap(), other);
        assert_eq!(get_secret("other-secret-2").unwrap(), "kept");
        assert!(get_optional_secret(NAME).unwrap().is_none());
    }

    #[test]
    fn deleting_removes_the_parts_even_when_the_manifest_is_corrupt_or_missing() {
        let _vault = TestVault::new();
        file_vault::raw_set(&manifest_name(NAME), "not-a-number");
        for index in 0..3 {
            file_vault::raw_set(&chunk_name(NAME, Slot::A, index), "fragment");
        }
        file_vault::raw_set(&chunk_name(NAME, Slot::B, 0), "fragment");
        delete_secret(NAME);
        assert!(stored().is_empty());

        // Parts without any manifest.
        file_vault::raw_set(&chunk_name(NAME, Slot::A, 0), "fragment");
        file_vault::raw_set(&chunk_name(NAME, Slot::B, 5), "fragment");
        delete_secret(NAME);
        assert!(stored().is_empty());
    }

    #[test]
    fn an_interrupted_long_overwrite_leaves_the_previous_secret_readable() {
        let old = secret(3_000, 'o');
        let new = secret(3_000, 'n');
        // Three parts and the manifest: four writes. An interruption before the
        // manifest is published keeps the previous secret; there is no state
        // in which a read mixes old and new parts.
        for allowed_writes in 0..4 {
            let _vault = TestVault::new();
            set_secret(NAME, &old).unwrap();

            file_vault::fail_after_writes(allowed_writes);
            assert!(set_secret(NAME, &new).is_err());
            file_vault::stop_failing();

            assert_eq!(
                get_secret(NAME).unwrap(),
                old,
                "interrupted after {allowed_writes} write(s)"
            );
        }

        let _vault = TestVault::new();
        set_secret(NAME, &old).unwrap();
        file_vault::fail_after_writes(4);
        set_secret(NAME, &new).unwrap();
        file_vault::stop_failing();
        assert_eq!(get_secret(NAME).unwrap(), new);
    }

    #[test]
    fn an_interrupted_write_over_a_short_secret_keeps_the_short_secret() {
        for allowed_writes in 0..4 {
            let _vault = TestVault::new();
            set_secret(NAME, "old short").unwrap();

            file_vault::fail_after_writes(allowed_writes);
            assert!(set_secret(NAME, &secret(3_000, 'n')).is_err());
            file_vault::stop_failing();

            assert_eq!(get_secret(NAME).unwrap(), "old short");
        }
    }

    #[test]
    fn an_interrupted_write_of_a_short_secret_keeps_the_previous_long_secret() {
        let _vault = TestVault::new();
        let old = secret(3_000, 'o');
        set_secret(NAME, &old).unwrap();

        file_vault::fail_after_writes(0);
        assert!(set_secret(NAME, "new short").is_err());
        file_vault::stop_failing();

        assert_eq!(get_secret(NAME).unwrap(), old);
    }

    #[test]
    fn parts_left_by_an_interrupted_write_are_removed_by_the_next_write() {
        let _vault = TestVault::new();
        set_secret(NAME, &secret(3_000, 'o')).unwrap();
        file_vault::fail_after_writes(2);
        assert!(set_secret(NAME, &secret(3_000, 'n')).is_err());
        file_vault::stop_failing();
        // Two parts of the unpublished version are in the vault.
        assert!(stored().contains(&chunk_name(NAME, Slot::B, 1)));

        let next = secret(2_000, 'x');
        set_secret(NAME, &next).unwrap();

        assert_eq!(stored(), chunked(Slot::B, 2));
        assert_eq!(get_secret(NAME).unwrap(), next);
    }

    #[test]
    fn parts_left_by_an_interrupted_write_are_removed_by_delete() {
        let _vault = TestVault::new();
        set_secret(NAME, &secret(3_000, 'o')).unwrap();
        file_vault::fail_after_writes(3);
        assert!(set_secret(NAME, &secret(3_000, 'n')).is_err());
        file_vault::stop_failing();

        delete_secret(NAME);

        assert!(stored().is_empty());
    }

    #[test]
    fn a_corrupt_manifest_is_a_safe_error_and_never_a_partial_secret() {
        for raw in [
            "0",
            "129",
            "not-a-number",
            "",
            "-1",
            "+3",
            " 3",
            "3.0",
            "b:",
            "b:0",
            "b:129",
            "b:x",
        ] {
            let _vault = TestVault::new();
            file_vault::raw_set(&manifest_name(NAME), raw);
            file_vault::raw_set(&chunk_name(NAME, Slot::A, 0), "fragment");
            file_vault::raw_set(&chunk_name(NAME, Slot::B, 0), "fragment");

            let error = get_secret(NAME).expect_err(raw);
            assert!(error.contains("invalide"), "{raw:?}: {error}");
            assert!(get_optional_secret(NAME).is_err(), "{raw:?}");
        }
    }

    #[test]
    fn a_missing_part_is_an_explicit_error_and_the_other_parts_are_never_returned() {
        let _vault = TestVault::new();
        file_vault::raw_set(&manifest_name(NAME), "3");
        file_vault::raw_set(&chunk_name(NAME, Slot::A, 0), "first");
        file_vault::raw_set(&chunk_name(NAME, Slot::A, 2), "third");
        let error = get_secret(NAME).unwrap_err();
        assert!(error.contains("incomplet"), "{error}");

        file_vault::raw_set(&manifest_name(NAME), "b:3");
        file_vault::raw_set(&chunk_name(NAME, Slot::B, 0), "first");
        file_vault::raw_set(&chunk_name(NAME, Slot::B, 2), "third");
        let error = get_secret(NAME).unwrap_err();
        assert!(error.contains("incomplet"), "{error}");
    }

    #[test]
    fn writing_a_secret_repairs_a_corrupt_manifest_and_removes_its_leftovers() {
        let _vault = TestVault::new();
        file_vault::raw_set(&manifest_name(NAME), "garbage");
        file_vault::raw_set(&chunk_name(NAME, Slot::A, 0), "old fragment");
        file_vault::raw_set(&chunk_name(NAME, Slot::A, 4), "old fragment");
        file_vault::raw_set(&chunk_name(NAME, Slot::B, 0), "old fragment");

        let value = secret(2_000, 'v');
        set_secret(NAME, &value).unwrap();
        assert_eq!(stored(), chunked(Slot::A, 2));
        assert_eq!(get_secret(NAME).unwrap(), value);

        file_vault::raw_set(&manifest_name(NAME), "garbage");
        file_vault::raw_set(&chunk_name(NAME, Slot::B, 1), "old fragment");
        set_secret(NAME, "short").unwrap();
        assert_eq!(stored(), only_credential());
    }

    #[test]
    fn secrets_written_by_the_first_release_are_still_readable_and_replaced_cleanly() {
        let _vault = TestVault::new();
        // The first release: manifest "<count>", parts `<name>-chunk-v1-<i>`.
        file_vault::raw_set(&manifest_name(NAME), "2");
        file_vault::raw_set(&format!("{NAME}-chunk-v1-0"), "hello ");
        file_vault::raw_set(&format!("{NAME}-chunk-v1-1"), "world");
        assert_eq!(get_secret(NAME).unwrap(), "hello world");

        let value = secret(2_500, 'n');
        set_secret(NAME, &value).unwrap();

        assert_eq!(get_secret(NAME).unwrap(), value);
        assert_eq!(stored(), chunked(Slot::B, 3));
        assert!(manifest().unwrap().starts_with("b:"));
    }

    #[test]
    fn logout_clears_the_grant_and_keeps_the_device_identity_and_the_database_key() {
        let _vault = TestVault::new();
        let private_key = secret(1_700, 'k');
        let grant = secret(1_500, 'g');
        set_secret("installation-id", "00000000-0000-4000-8000-000000000000").unwrap();
        set_secret("database-key-v1", "synthetic-database-key").unwrap();
        set_secret("device-private-key", &private_key).unwrap();
        store_grant(&grant, "synthetic-grant-public-key").unwrap();
        assert_eq!(get_secret("offline-grant").unwrap(), grant);

        clear_session();

        assert!(get_optional_secret("offline-grant").unwrap().is_none());
        assert!(get_optional_secret("grant-public-key").unwrap().is_none());
        assert!(stored().iter().all(
            |name| !name.starts_with("offline-grant") && !name.starts_with("grant-public-key")
        ));
        assert_eq!(
            get_secret("installation-id").unwrap(),
            "00000000-0000-4000-8000-000000000000"
        );
        assert_eq!(
            get_secret("database-key-v1").unwrap(),
            "synthetic-database-key"
        );
        assert_eq!(get_secret("device-private-key").unwrap(), private_key);
    }

    #[test]
    fn the_database_key_is_created_once_and_reused() {
        let _vault = TestVault::new();
        let first = database_key().unwrap();
        let second = database_key().unwrap();

        assert_eq!(first.len(), 32);
        assert_eq!(first, second);
    }
}

// The same behaviours against the real Windows Credential Manager (and, on
// another platform, the platform's own store). They are ignored by default and
// run on purpose: `HEALIX_REAL_KEYRING_TESTS=1 cargo test real_credential_manager
// -- --ignored --test-threads=1`. They only use synthetic secrets, under a
// service of their own (`dz.healix.desktop.test`) and a random name, and erase
// them afterwards: they never read or modify the secrets of an installed
// HealixDz Desktop.
#[cfg(test)]
mod real_credential_manager {
    use super::*;

    struct Cleanup(String);

    impl Drop for Cleanup {
        fn drop(&mut self) {
            delete_secret(&self.0);
        }
    }

    fn synthetic(label: &str) -> (String, Cleanup) {
        assert_eq!(
            std::env::var("HEALIX_REAL_KEYRING_TESTS").as_deref(),
            Ok("1"),
            "set HEALIX_REAL_KEYRING_TESTS=1 to run the real Credential Manager tests"
        );
        let name = format!("healix-qual-{label}-{}", Uuid::new_v4());
        (name.clone(), Cleanup(name))
    }

    // Every credential of the secret that exists in the vault.
    fn existing(name: &str) -> Vec<String> {
        let mut candidates = vec![name.to_string(), manifest_name(name)];
        for slot in [Slot::A, Slot::B] {
            candidates.extend((0..MAX_KEYRING_CHUNKS).map(|index| chunk_name(name, slot, index)));
        }
        let mut found: Vec<String> = candidates
            .into_iter()
            .filter(|candidate| get_entry_secret(candidate).unwrap().is_some())
            .collect();
        found.sort();
        found
    }

    fn secret(units: usize, filler: char) -> String {
        std::iter::repeat_n(filler, units).collect()
    }

    #[test]
    #[ignore = "uses the real credential vault: run on purpose, see the module comment"]
    fn short_secret_round_trip() {
        let (name, _cleanup) = synthetic("short");
        set_secret(&name, "short secret").unwrap();

        assert_eq!(get_secret(&name).unwrap(), "short secret");
        assert_eq!(existing(&name), vec![name.clone()]);
    }

    #[test]
    #[ignore = "uses the real credential vault: run on purpose, see the module comment"]
    fn secrets_around_the_credential_limit_round_trip() {
        let (name, _cleanup) = synthetic("limit");
        // 1,200 is the chunk size, 1,280 is the Credential Manager maximum
        // (2,560 bytes of UTF-16).
        for units in [
            1, 1_199, 1_200, 1_201, 1_280, 1_281, 2_400, 2_401, 3_600, 6_000,
        ] {
            let value = secret(units, 'a');
            set_secret(&name, &value).unwrap();
            assert_eq!(get_secret(&name).unwrap(), value, "{units} units");
            assert_eq!(
                existing(&name).len() == 1,
                units <= KEYRING_CHUNK_UTF16_LIMIT,
                "{units} units"
            );
        }
    }

    #[test]
    #[ignore = "uses the real credential vault: run on purpose, see the module comment"]
    fn unicode_and_multi_chunk_secrets_are_rebuilt_exactly() {
        let (name, _cleanup) = synthetic("unicode");
        let values = [
            format!("{}😀{}", secret(1_199, 'a'), secret(1_500, 'b')),
            "مرحبا بالعالم ".repeat(400),
            "éàùçœ—’".repeat(700),
            format!("{}é{}", secret(1_199, 'x'), "日本語".repeat(900)),
            format!(
                "{}{}{}",
                secret(1_200, 'a'),
                secret(1_200, 'b'),
                secret(500, 'c')
            ),
        ];
        for value in values {
            set_secret(&name, &value).unwrap();
            assert_eq!(get_secret(&name).unwrap(), value);
        }

        // Three parts and the manifest, under the documented names.
        let value = format!(
            "{}{}{}",
            secret(1_200, 'a'),
            secret(1_200, 'b'),
            secret(500, 'c')
        );
        set_secret(&name, &value).unwrap();
        let found = existing(&name);
        assert_eq!(found.len(), 4, "{found:?}");
        assert!(found.contains(&manifest_name(&name)));
        let manifest = get_entry_secret(&manifest_name(&name)).unwrap().unwrap();
        assert!(
            matches!(parse_manifest(&manifest), Some((_, 3))),
            "{manifest}"
        );
    }

    #[test]
    #[ignore = "uses the real credential vault: run on purpose, see the module comment"]
    fn overwriting_removes_the_obsolete_parts() {
        let (name, _cleanup) = synthetic("overwrite");

        set_secret(&name, &secret(4_500, 'a')).unwrap();
        assert_eq!(existing(&name).len(), 1 + 4);

        let second = secret(2_000, 'b');
        set_secret(&name, &second).unwrap();
        assert_eq!(existing(&name).len(), 1 + 2);
        assert_eq!(get_secret(&name).unwrap(), second);

        set_secret(&name, "short again").unwrap();
        assert_eq!(existing(&name), vec![name.clone()]);
        assert_eq!(get_secret(&name).unwrap(), "short again");
    }

    #[test]
    #[ignore = "uses the real credential vault: run on purpose, see the module comment"]
    fn deleting_removes_the_credential_the_manifest_and_every_part() {
        let (name, _cleanup) = synthetic("delete");
        set_secret(&name, &secret(4_500, 'a')).unwrap();
        set_secret(&name, &secret(3_000, 'b')).unwrap();
        assert!(existing(&name).len() > 1);

        delete_secret(&name);

        assert!(existing(&name).is_empty());
        assert!(get_secret(&name).is_err());
    }

    #[test]
    #[ignore = "uses the real credential vault: run on purpose, see the module comment"]
    fn corrupt_manifest_and_missing_part_are_safe_errors() {
        let (name, _cleanup) = synthetic("corrupt");
        set_entry_secret(&manifest_name(&name), "not-a-number").unwrap();
        set_entry_secret(&chunk_name(&name, Slot::A, 0), "fragment").unwrap();
        assert!(get_secret(&name).unwrap_err().contains("invalide"));

        set_entry_secret(&manifest_name(&name), "3").unwrap();
        set_entry_secret(&chunk_name(&name, Slot::A, 2), "third").unwrap();
        assert!(get_secret(&name).unwrap_err().contains("incomplet"));

        delete_secret(&name);
        assert!(existing(&name).is_empty());
    }
}
