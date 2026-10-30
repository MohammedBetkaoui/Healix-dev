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

const SERVICE: &str = "dz.healix.desktop";
// Windows Credential Manager limits the credential blob to 2,560 bytes.
// `keyring` encodes passwords as UTF-16, so the effective maximum is 1,280
// code units. Keep a margin: the parts remain in Credential Manager, never
// in a plaintext file or in the SQLCipher database.
const KEYRING_CHUNK_UTF16_LIMIT: usize = 1_200;
const MAX_KEYRING_CHUNKS: usize = 128;
const CHUNK_MANIFEST_SUFFIX: &str = "-chunk-manifest-v1";

fn manifest_name(name: &str) -> String {
    format!("{name}{CHUNK_MANIFEST_SUFFIX}")
}

fn chunk_name(name: &str, index: usize) -> String {
    format!("{name}-chunk-v1-{index}")
}

fn entry(name: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, name).map_err(|error| {
        format!("Coffre-fort système indisponible pour ce compte Windows ({error}).")
    })
}

pub fn set_secret(name: &str, value: &str) -> Result<(), String> {
    let chunks = split_secret(value);
    let previous_chunk_count = chunk_count(name)?;

    if chunks.len() == 1 {
        set_entry_secret(name, value)?;
        delete_chunked_secret(name, previous_chunk_count);
        return Ok(());
    }

    // Write the parts before publishing their manifest. If an interrupted
    // write occurs, the prior credential remains readable.
    for (index, chunk) in chunks.iter().enumerate() {
        set_entry_secret(&chunk_name(name, index), chunk)?;
    }
    set_entry_secret(&manifest_name(name), &chunks.len().to_string())?;
    delete_entry_secret(name);
    if let Some(previous_chunk_count) = previous_chunk_count {
        for index in chunks.len()..previous_chunk_count {
            delete_entry_secret(&chunk_name(name, index));
        }
    }
    Ok(())
}

pub fn get_secret(name: &str) -> Result<String, String> {
    get_optional_secret(name)?.ok_or_else(|| "Session offline absente ou verrouillée.".to_string())
}

fn get_optional_secret(name: &str) -> Result<Option<String>, String> {
    if let Some(count) = chunk_count(name)? {
        let mut value = String::new();
        for index in 0..count {
            let part = get_entry_secret(&chunk_name(name, index))?.ok_or_else(|| {
                "Secret local fragmenté incomplet dans le Gestionnaire d’informations d’identification Windows."
                    .to_string()
            })?;
            value.push_str(&part);
        }
        return Ok(Some(value));
    }
    get_entry_secret(name)
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

fn chunk_count(name: &str) -> Result<Option<usize>, String> {
    let Some(raw) = get_entry_secret(&manifest_name(name))? else {
        return Ok(None);
    };
    let count = raw.parse::<usize>().map_err(|_| {
        "Manifest du secret local fragmenté invalide dans le Gestionnaire d’informations d’identification Windows."
            .to_string()
    })?;
    if count == 0 || count > MAX_KEYRING_CHUNKS {
        return Err("Manifest du secret local fragmenté invalide dans le Gestionnaire d’informations d’identification Windows.".to_string());
    }
    Ok(Some(count))
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

fn delete_chunked_secret(name: &str, chunk_count: Option<usize>) {
    delete_entry_secret(&manifest_name(name));
    if let Some(chunk_count) = chunk_count {
        for index in 0..chunk_count {
            delete_entry_secret(&chunk_name(name, index));
        }
    }
}

pub fn delete_secret(name: &str) {
    delete_entry_secret(name);
    let count = chunk_count(name).ok().flatten();
    delete_chunked_secret(name, count);
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
#[cfg(feature = "e2e-harness")]
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

#[cfg(not(feature = "e2e-harness"))]
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

#[cfg(test)]
mod tests {
    use super::{split_secret, KEYRING_CHUNK_UTF16_LIMIT};

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
}
