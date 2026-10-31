mod ai_reports;
mod consultation;
mod database;
#[cfg(feature = "e2e-harness")]
pub mod e2e_harness;
mod failpoint;
mod network;
mod protocol;
mod reads;
mod security;

use database::EngineEnv;
use tauri::{AppHandle, Manager};

fn authorize(app: &EngineEnv) -> Result<(String, security::GrantClaims), String> {
    let verified = security::verified_grant()?;
    database::assert_clock(app, &verified.1)?;
    Ok(verified)
}

// Runs a read of clinical data only with a valid offline authorization: the
// grant is verified and the clock checked before the read is even attempted.
fn guarded<T>(
    env: &EngineEnv,
    read: impl FnOnce(&EngineEnv) -> Result<T, String>,
) -> Result<T, String> {
    authorize(env)?;
    read(env)
}

#[tauri::command]
fn session_status(app: AppHandle) -> Result<database::SessionStatus, String> {
    let app = EngineEnv::from_app(&app);
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
    network::login_register_and_bootstrap(&EngineEnv::from_app(&app), &api_base, input).await
}

#[tauri::command]
fn list_local_patients(app: AppHandle, query: String) -> Result<Vec<serde_json::Value>, String> {
    let app = EngineEnv::from_app(&app);
    authorize(&app)?;
    database::list_patients(&app, &query)
}

#[tauri::command]
fn save_consultation_draft(
    app: AppHandle,
    input: database::ConsultationDraftInput,
) -> Result<database::SavedDraft, String> {
    let app = EngineEnv::from_app(&app);
    let (_, claims) = authorize(&app)?;
    database::save_draft(&app, &claims, input)
}

#[tauri::command]
fn list_patient_prescriptions(
    app: AppHandle,
    patient_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    let app = EngineEnv::from_app(&app);
    authorize(&app)?;
    database::list_patient_prescriptions(&app, &patient_id)
}

#[tauri::command]
fn get_local_prescription(app: AppHandle, local_id: String) -> Result<serde_json::Value, String> {
    let app = EngineEnv::from_app(&app);
    authorize(&app)?;
    database::get_local_prescription(&app, &local_id)
}

// Read-only views for the Desktop pages (src/reads.rs).
#[tauri::command]
fn list_appointments(
    app: AppHandle,
    from: String,
    to: String,
) -> Result<Vec<serde_json::Value>, String> {
    guarded(&EngineEnv::from_app(&app), |env| {
        reads::list_appointments(env, &from, &to)
    })
}

#[tauri::command]
fn get_local_patient(app: AppHandle, patient_id: String) -> Result<serde_json::Value, String> {
    guarded(&EngineEnv::from_app(&app), |env| {
        reads::get_patient(env, &patient_id)
    })
}

// A prescription printed on this device is recorded in the local audit trail.
#[tauri::command]
fn record_prescription_print(app: AppHandle, local_id: String) -> Result<(), String> {
    let env = EngineEnv::from_app(&app);
    let (_, claims) = authorize(&env)?;
    database::record_prescription_print(&env, &claims, &local_id)
}

// The validated AI results of the patients on this device, read-only, from the
// encrypted cache the last synchronization filled. `since`: an ISO-8601 instant.
#[tauri::command]
fn list_ai_reports(
    app: AppHandle,
    patient_id: Option<String>,
    since: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    guarded(&EngineEnv::from_app(&app), |env| {
        ai_reports::list(env, patient_id.as_deref(), since.as_deref())
    })
}

#[tauri::command]
fn get_ai_report(app: AppHandle, run_id: String) -> Result<serde_json::Value, String> {
    guarded(&EngineEnv::from_app(&app), |env| {
        ai_reports::get(env, &run_id)
    })
}

#[tauri::command]
fn list_consultations(
    app: AppHandle,
    patient_id: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    guarded(&EngineEnv::from_app(&app), |env| {
        reads::list_consultations(env, patient_id.as_deref())
    })
}

#[tauri::command]
fn get_consultation(app: AppHandle, local_id: String) -> Result<serde_json::Value, String> {
    guarded(&EngineEnv::from_app(&app), |env| {
        reads::get_consultation(env, &local_id)
    })
}

#[tauri::command]
fn list_prescriptions(
    app: AppHandle,
    patient_id: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    guarded(&EngineEnv::from_app(&app), |env| {
        reads::list_prescriptions(env, patient_id.as_deref())
    })
}

#[tauri::command]
fn save_prescription_draft(
    app: AppHandle,
    input: database::PrescriptionDraftInput,
) -> Result<database::SavedDraft, String> {
    let app = EngineEnv::from_app(&app);
    let (_, claims) = authorize(&app)?;
    database::save_prescription_draft(&app, &claims, input)
}

#[tauri::command]
fn search_local_medications(
    app: AppHandle,
    query: String,
) -> Result<Vec<serde_json::Value>, String> {
    let app = EngineEnv::from_app(&app);
    authorize(&app)?;
    database::search_local_medications(&app, &query)
}

#[tauri::command]
async fn sync_now(app: AppHandle, api_base: String) -> Result<database::SyncStatus, String> {
    let app = EngineEnv::from_app(&app);
    let (grant, claims) = authorize(&app)?;
    network::sync_now(&app, &api_base, &grant, &claims).await
}

#[tauri::command]
fn get_sync_status(app: AppHandle) -> Result<database::SyncStatus, String> {
    let app = EngineEnv::from_app(&app);
    authorize(&app)?;
    database::sync_status(&app)
}

#[tauri::command]
fn logout_local(app: AppHandle) {
    security::clear_session();
    // The printed identity (registration number, cabinet) goes with the
    // session; the next login brings it back.
    let env = EngineEnv::from_app(&app);
    let _ = database::clear_print_identity(&env);
    // The AI results of the patients go with it too.
    let _ = ai_reports::clear(&env);
}

// Address of the HealixDz Web platform (Healix AI lives there), from the same
// build variable the front-end reads. Development defaults to the local Next
// server; a release without an HTTPS address has no Web entry.
fn web_app_url() -> Option<&'static str> {
    match option_env!("VITE_WEB_APP_URL").map(str::trim) {
        Some(url) if url.starts_with("https://") => Some(url.trim_end_matches('/')),
        Some(url) if cfg!(debug_assertions) && !url.is_empty() => Some(url.trim_end_matches('/')),
        _ if cfg!(debug_assertions) => Some("http://localhost:3000"),
        _ => None,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // The window may open the system browser on the Web platform's doctor
        // pages, and on nothing else: the scope is granted here, at start-up,
        // only when the build carries the platform address.
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(web) = web_app_url() {
                app.add_capability(
                    tauri::ipc::CapabilityBuilder::new("web-app-opener")
                        .window("main")
                        .permission_scoped(
                            "opener:allow-open-url",
                            vec![serde_json::json!({ "url": format!("{web}/doctor/*") })],
                            vec![],
                        ),
                )?;
            }
            Ok(())
        })
        // Official Tauri 2 update mechanism: the versioned manifest
        // (latest.json) is fetched from the configured endpoints, and the
        // downloaded package is verified against the minisign public key in
        // tauri.conf.json before the installer is ever run (never signed?
        // then no update is installed). The update itself is only offered
        // from the login screen — never during an open consultation — and
        // `plugin-process` provides the app relaunch after it is applied.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            session_status,
            login_register_and_bootstrap,
            list_local_patients,
            save_consultation_draft,
            list_patient_prescriptions,
            get_local_prescription,
            list_appointments,
            get_local_patient,
            record_prescription_print,
            list_ai_reports,
            get_ai_report,
            list_consultations,
            get_consultation,
            list_prescriptions,
            save_prescription_draft,
            search_local_medications,
            sync_now,
            get_sync_status,
            logout_local
        ])
        .run(tauri::generate_context!())
        .expect("HealixDz Desktop failed to start");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    #[test]
    fn reads_are_refused_without_a_valid_grant_and_never_attempted() {
        let directory =
            std::env::temp_dir().join(format!("healixdz-guard-{}", uuid::Uuid::new_v4()));
        let env = EngineEnv::from_dir(directory.clone());
        let attempted = Cell::new(false);

        let refused = guarded(&env, |_| {
            attempted.set(true);
            Ok(())
        });

        assert!(refused.is_err());
        assert!(!attempted.get(), "the read ran without an authorization");
        // The refusal happens before the encrypted database is even created.
        assert!(!directory.join("healixdz-offline-v1.db").exists());
        let _ = std::fs::remove_dir_all(directory);
    }
}
