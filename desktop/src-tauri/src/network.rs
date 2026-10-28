use reqwest::{Client, Response};
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;
use tauri::AppHandle;

use crate::{
    database,
    security::{self, GrantClaims},
};

pub fn client() -> Result<Client, String> {
    Client::builder()
        .cookie_store(true)
        .timeout(Duration::from_secs(25))
        .user_agent("HealixDz-Desktop/0.1")
        .build()
        .map_err(|_| "Client réseau indisponible.".to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginInput {
    pub account_type: String,
    pub email: String,
    pub password: String,
    pub device_name: String,
}

fn endpoint(api_base: &str, path: &str) -> Result<String, String> {
    let base = api_base.trim().trim_end_matches('/');
    if !(base.starts_with("https://") || base.starts_with("http://localhost") || base.starts_with("http://127.0.0.1")) {
        return Err("L’API Desktop doit utiliser HTTPS hors développement local.".to_string());
    }
    Ok(format!("{base}/{path}"))
}

async fn checked_json(response: Response) -> Result<Value, String> {
    let status = response.status();
    let body = response
        .json::<Value>()
        .await
        .map_err(|_| "Réponse serveur illisible.".to_string())?;
    if status.is_success() {
        return Ok(body);
    }
    let message = body
        .get("message")
        .and_then(|value| {
            value
                .as_str()
                .map(str::to_string)
                .or_else(|| value.as_array().map(|items| {
                    items.iter().filter_map(Value::as_str).collect::<Vec<_>>().join(" ")
                }))
        })
        .unwrap_or_else(|| format!("Erreur serveur {status}."));
    Err(message)
}

async fn checked_grant_json(response: Response) -> Result<Value, String> {
    if matches!(
        response.status(),
        reqwest::StatusCode::UNAUTHORIZED | reqwest::StatusCode::FORBIDDEN
    ) {
        security::clear_session();
        return Err(
            "Autorisation offline révoquée ou expirée. Les données locales sont verrouillées."
                .to_string(),
        );
    }
    checked_json(response).await
}

pub async fn login_register_and_bootstrap(
    app: &AppHandle,
    api_base: &str,
    input: LoginInput,
) -> Result<database::SessionStatus, String> {
    let http = client()?;
    let login = http
        .post(endpoint(api_base, "auth/login")?)
        .json(&json!({
            "accountType": input.account_type,
            "email": input.email,
            "password": input.password
        }))
        .send()
        .await
        .map_err(|_| "Connexion au serveur impossible.".to_string())?;
    checked_json(login).await?;

    let (installation_id, public_key) = security::device_identity()?;
    let registration = http
        .post(endpoint(api_base, "devices/register")?)
        .json(&json!({
            "installationId": installation_id,
            "deviceName": input.device_name,
            "platform": std::env::consts::OS,
            "publicKey": public_key
        }))
        .send()
        .await
        .map_err(|_| "Enregistrement de l’appareil impossible.".to_string())?;
    let registered = checked_json(registration).await?;
    let grant = registered
        .get("offlineAccessGrant")
        .and_then(Value::as_str)
        .ok_or_else(|| "Grant offline absent.".to_string())?;
    let grant_public_key = registered
        .get("grantVerificationPublicKey")
        .and_then(Value::as_str)
        .ok_or_else(|| "Clé de vérification du grant absente.".to_string())?;
    security::store_grant(grant, grant_public_key)?;
    let (_, claims) = security::verified_grant()?;

    let bootstrap = http
        .post(endpoint(api_base, "sync/bootstrap")?)
        .bearer_auth(grant)
        .send()
        .await
        .map_err(|_| "Bootstrap clinique impossible.".to_string())?;
    let bootstrap = checked_grant_json(bootstrap).await?;
    database::apply_bootstrap(app, &bootstrap)?;
    database::assert_clock(app, &claims)?;
    database::session_status(app, Some(&claims))
}

pub async fn sync_now(
    app: &AppHandle,
    api_base: &str,
    grant: &str,
    _claims: &GrantClaims,
) -> Result<database::SyncStatus, String> {
    let http = client()?;
    let operations = database::pending_operations(app)?;
    let total = operations.len() as i64;
    if !operations.is_empty() {
        let response = http
            .post(endpoint(api_base, "sync/push")?)
            .bearer_auth(grant)
            .json(&json!({ "operations": operations }))
            .send()
            .await
            .map_err(|_| "Push de synchronisation impossible.".to_string())?;
        let body = checked_grant_json(response).await?;
        let results = body
            .get("results")
            .and_then(Value::as_array)
            .ok_or_else(|| "Résultats push absents.".to_string())?;
        database::apply_push_results(app, results)?;
    }

    loop {
        let cursor = database::current_cursor(app)?;
        let response = http
            .get(endpoint(api_base, "sync/pull")?)
            .bearer_auth(grant)
            .query(&[("cursor", cursor)])
            .send()
            .await
            .map_err(|_| "Pull de synchronisation impossible.".to_string())?;
        let body = checked_grant_json(response).await?;
        let next_cursor = database::apply_pull(app, &body)?;
        let ack = http
            .post(endpoint(api_base, "sync/ack")?)
            .bearer_auth(grant)
            .json(&json!({ "cursor": next_cursor }))
            .send()
            .await
            .map_err(|_| "ACK de synchronisation impossible.".to_string())?;
        checked_grant_json(ack).await?;
        if !body.get("hasMore").and_then(Value::as_bool).unwrap_or(false) {
            break;
        }
    }
    let mut status = database::sync_status(app)?;
    status.processed = Some(total);
    status.total = Some(total);
    Ok(status)
}
