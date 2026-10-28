mod database;
mod network;
mod security;

use tauri::AppHandle;

fn authorize(app: &AppHandle) -> Result<(String, security::GrantClaims), String> {
    let verified = security::verified_grant()?;
    database::assert_clock(app, &verified.1)?;
    Ok(verified)
}

#[tauri::command]
fn session_status(app: AppHandle) -> Result<database::SessionStatus, String> {
    match security::verified_grant() {
        Ok((_, claims)) if database::assert_clock(&app, &claims).is_ok() => {
            database::session_status(&app, Some(&claims))
        }
        Err(_) => database::session_status(&app, None),
        _ => database::session_status(&app, None),
    }
}

#[tauri::command]
async fn login_register_and_bootstrap(
    app: AppHandle,
    api_base: String,
    input: network::LoginInput,
) -> Result<database::SessionStatus, String> {
    network::login_register_and_bootstrap(&app, &api_base, input).await
}

#[tauri::command]
fn list_local_patients(app: AppHandle, query: String) -> Result<Vec<serde_json::Value>, String> {
    authorize(&app)?;
    database::list_patients(&app, &query)
}

#[tauri::command]
fn save_consultation_draft(
    app: AppHandle,
    input: database::ConsultationDraftInput,
) -> Result<database::SavedDraft, String> {
    let (_, claims) = authorize(&app)?;
    database::save_draft(&app, &claims, input)
}

#[tauri::command]
async fn sync_now(app: AppHandle, api_base: String) -> Result<database::SyncStatus, String> {
    let (grant, claims) = authorize(&app)?;
    network::sync_now(&app, &api_base, &grant, &claims).await
}

#[tauri::command]
fn get_sync_status(app: AppHandle) -> Result<database::SyncStatus, String> {
    authorize(&app)?;
    database::sync_status(&app)
}

#[tauri::command]
fn logout_local() {
    security::clear_session();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            session_status,
            login_register_and_bootstrap,
            list_local_patients,
            save_consultation_draft,
            sync_now,
            get_sync_status,
            logout_local
        ])
        .run(tauri::generate_context!())
        .expect("HealixDz Desktop failed to start");
}
