use reqwest::{Client, Response, Url};
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;
use tauri::AppHandle;

use crate::{
    database,
    protocol::{sha256_hex, EMPTY_BODY_SHA256},
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
    if !(base.starts_with("https://")
        || base.starts_with("http://localhost")
        || base.starts_with("http://127.0.0.1"))
    {
        return Err("L’API Desktop doit utiliser HTTPS hors développement local.".to_string());
    }
    Ok(format!("{base}/{path}"))
}

// The signed PATH is the URL path without the query string, exactly what
// the backend rebuilds from the received request.
fn request_path(url: &str) -> Result<String, String> {
    let parsed = Url::parse(url).map_err(|_| "URL de synchronisation invalide.".to_string())?;
    Ok(parsed.path().to_string())
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
            value.as_str().map(str::to_string).or_else(|| {
                value.as_array().map(|items| {
                    items
                        .iter()
                        .filter_map(Value::as_str)
                        .collect::<Vec<_>>()
                        .join(" ")
                })
            })
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

// One signed sync request: Bearer grant + device proof headers. `body` is
// the exact bytes that leave the machine; their SHA-256 is part of the
// signature, so a tampered body breaks it.
async fn signed_request(
    claims: &GrantClaims,
    http: &Client,
    url: String,
    method: reqwest::Method,
    body: Option<&[u8]>,
) -> Result<Response, String> {
    let path = request_path(&url)?;
    let body_sha256 = match body {
        Some(bytes) => sha256_hex(bytes),
        None => EMPTY_BODY_SHA256.to_string(),
    };
    let mut request = http
        .request(method.clone(), &url)
        .bearer_auth(security::get_secret("offline-grant")?);
    for (name, value) in
        security::signed_request_headers(method.as_str(), &path, &body_sha256, &claims.device_id)?
    {
        request = request.header(name, value);
    }
    if let Some(bytes) = body {
        request = request
            .header("content-type", "application/json")
            .body(bytes.to_vec());
    }
    request
        .send()
        .await
        .map_err(|_| "Connexion au serveur impossible.".to_string())
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

    let bootstrap_url = endpoint(api_base, "sync/bootstrap")?;
    let bootstrap =
        signed_request(&claims, &http, bootstrap_url, reqwest::Method::POST, None).await?;
    let bootstrap = checked_grant_json(bootstrap).await?;
    database::apply_bootstrap(app, &bootstrap)?;
    database::assert_clock(app, &claims)?;
    database::session_status(app, Some(&claims))
}

pub async fn sync_now(
    app: &AppHandle,
    api_base: &str,
    _grant: &str,
    claims: &GrantClaims,
) -> Result<database::SyncStatus, String> {
    let http = client()?;
    let http = &http;

    // Scope reconciliation before any exchange: the server decides which
    // patients stay; stale ones are purged or locked locally right away.
    let recon_url = endpoint(api_base, "sync/reconcile")?;
    let reconcile = signed_request(claims, http, recon_url, reqwest::Method::POST, None).await?;
    let reconcile = checked_grant_json(reconcile).await?;
    database::apply_reconcile(app, &reconcile)?;

    let operations = database::pending_operations(app)?;
    let total = operations.len() as i64;
    if !operations.is_empty() {
        let body = serde_json::to_vec(&json!({ "operations": operations }))
            .map_err(|_| "Opérations locales illisibles.".to_string())?;
        let push_url = endpoint(api_base, "sync/push")?;
        let response = signed_request(
            claims,
            http,
            push_url,
            reqwest::Method::POST,
            Some(body.as_slice()),
        )
        .await?;
        let response_body = checked_grant_json(response).await?;
        let results = response_body
            .get("results")
            .and_then(Value::as_array)
            .ok_or_else(|| "Résultats push absents.".to_string())?;
        database::apply_push_results(app, results)?;
    }

    loop {
        let cursor = database::current_cursor(app)?;
        let pull_url = endpoint(api_base, "sync/pull")?;
        let pull_with_query = format!("{pull_url}?cursor={cursor}");
        let response =
            signed_request(claims, http, pull_with_query, reqwest::Method::GET, None).await?;
        let body = checked_grant_json(response).await?;
        let next_cursor = database::apply_pull(app, &body)?;
        let ack_body = serde_json::to_vec(&json!({ "cursor": next_cursor }))
            .map_err(|_| "Curseur local illisible.".to_string())?;
        let ack_url = endpoint(api_base, "sync/ack")?;
        let ack = signed_request(
            claims,
            http,
            ack_url,
            reqwest::Method::POST,
            Some(ack_body.as_slice()),
        )
        .await?;
        checked_grant_json(ack).await?;
        if !body
            .get("hasMore")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            break;
        }
    }
    let mut status = database::sync_status(app)?;
    status.processed = Some(total);
    status.total = Some(total);
    Ok(status)
}
