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

fn entry(name: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, name).map_err(|_| "Coffre-fort système indisponible.".to_string())
}

pub fn set_secret(name: &str, value: &str) -> Result<(), String> {
    entry(name)?
        .set_password(value)
        .map_err(|_| "Impossible de protéger le secret local.".to_string())
}

pub fn get_secret(name: &str) -> Result<String, String> {
    get_optional_secret(name)?.ok_or_else(|| "Session offline absente ou verrouillée.".to_string())
}

fn get_optional_secret(name: &str) -> Result<Option<String>, String> {
    match entry(name)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("Coffre-fort système indisponible.".to_string()),
    }
}

pub fn delete_secret(name: &str) {
    if let Ok(item) = entry(name) {
        let _ = item.delete_credential();
    }
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
