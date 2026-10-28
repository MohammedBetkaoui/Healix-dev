use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::security::{database_key, GrantClaims};

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS local_user (
  id TEXT PRIMARY KEY, full_name TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS local_workspace (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, workspace_type TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS local_device (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS patients (
  server_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  search_text TEXT NOT NULL,
  payload TEXT NOT NULL,
  server_updated_at TEXT NOT NULL,
  last_synced_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS patients_workspace_search_idx ON patients(workspace_id, search_text);
CREATE TABLE IF NOT EXISTS patient_medical_summaries (
  patient_server_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  server_updated_at TEXT NOT NULL,
  last_synced_at TEXT NOT NULL,
  FOREIGN KEY(patient_server_id) REFERENCES patients(server_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS consultations (
  local_id TEXT PRIMARY KEY,
  server_id TEXT UNIQUE,
  patient_server_id TEXT NOT NULL,
  local_status TEXT NOT NULL,
  base_version INTEGER,
  payload TEXT NOT NULL,
  server_updated_at TEXT,
  last_synced_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS consultations_patient_idx ON consultations(patient_server_id, updated_at);
CREATE TABLE IF NOT EXISTS consultation_vitals (
  consultation_local_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  FOREIGN KEY(consultation_local_id) REFERENCES consultations(local_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS consultation_diagnoses (
  id TEXT PRIMARY KEY,
  consultation_local_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  payload TEXT NOT NULL,
  FOREIGN KEY(consultation_local_id) REFERENCES consultations(local_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS prescription_drafts (
  local_id TEXT PRIMARY KEY, patient_server_id TEXT NOT NULL, payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prescription_items (
  id TEXT PRIMARY KEY, prescription_local_id TEXT NOT NULL, position INTEGER NOT NULL, payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS appointments_cache (
  server_id TEXT PRIMARY KEY, patient_server_id TEXT NOT NULL, payload TEXT NOT NULL,
  server_updated_at TEXT NOT NULL, last_synced_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_outbox (
  operation_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  local_entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  base_version INTEGER,
  payload TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  sequence INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sync_outbox_pending_idx ON sync_outbox(status, sequence);
CREATE TABLE IF NOT EXISTS sync_entity_map (
  entity_type TEXT NOT NULL, local_entity_id TEXT NOT NULL, server_entity_id TEXT NOT NULL,
  PRIMARY KEY(entity_type, local_entity_id), UNIQUE(entity_type, server_entity_id)
);
CREATE TABLE IF NOT EXISTS sync_metadata (
  entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, server_updated_at TEXT, last_synced_at TEXT NOT NULL,
  PRIMARY KEY(entity_type, entity_id)
);
CREATE TABLE IF NOT EXISTS sync_conflicts (
  id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  local_version INTEGER, server_version INTEGER, local_payload TEXT NOT NULL,
  server_payload TEXT NOT NULL, detected_at TEXT NOT NULL, status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_state (
  id INTEGER PRIMARY KEY CHECK(id = 1), cursor TEXT NOT NULL, last_synced_at TEXT,
  last_clock_seen INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS local_audit_events (
  id TEXT PRIMARY KEY, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  actor_id TEXT NOT NULL, device_id TEXT NOT NULL, occurred_at TEXT NOT NULL, synced_at TEXT
);
INSERT OR IGNORE INTO sync_state(id, cursor) VALUES (1, '');
"#;

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|_| "Répertoire de données local indisponible.".to_string())?;
    fs::create_dir_all(&directory)
        .map_err(|_| "Impossible de créer le répertoire local.".to_string())?;
    Ok(directory.join("healixdz-offline-v1.db"))
}

pub fn open(app: &AppHandle) -> Result<Connection, String> {
    let key = database_key()?;
    let connection = Connection::open(db_path(app)?)
        .map_err(|_| "Impossible d’ouvrir la base locale chiffrée.".to_string())?;
    connection
        .execute_batch(&format!(
            "PRAGMA key = \"x'{}'\"; PRAGMA cipher_memory_security = ON; PRAGMA foreign_keys = ON;",
            hex::encode(key)
        ))
        .map_err(|_| "Impossible de déverrouiller la base locale.".to_string())?;
    let cipher: Option<String> = connection
        .query_row("PRAGMA cipher_version", [], |row| row.get(0))
        .optional()
        .map_err(|_| "SQLCipher indisponible.".to_string())?;
    if cipher.as_deref().unwrap_or_default().is_empty() {
        return Err("Le chiffrement SQLCipher est requis.".to_string());
    }
    connection
        .execute_batch(SCHEMA)
        .map_err(|_| "Impossible d’initialiser le schéma local.".to_string())?;
    Ok(connection)
}

fn string(value: &Value, key: &str) -> Result<String, String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| format!("Réponse serveur incomplète: {key}."))
}

fn now_iso(connection: &Connection) -> Result<String, String> {
    connection
        .query_row(
            "SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
            [],
            |row| row.get(0),
        )
        .map_err(|_| "Horodatage local indisponible.".to_string())
}

fn purge_clinical_data(tx: &Transaction<'_>) -> rusqlite::Result<()> {
    tx.execute_batch(
        "DELETE FROM sync_conflicts;
         DELETE FROM sync_outbox;
         DELETE FROM sync_entity_map;
         DELETE FROM consultation_diagnoses;
         DELETE FROM consultation_vitals;
         DELETE FROM consultations;
         DELETE FROM appointments_cache;
         DELETE FROM prescription_items;
         DELETE FROM prescription_drafts;
         DELETE FROM patient_medical_summaries;
         DELETE FROM patients;
         DELETE FROM sync_metadata;
         DELETE FROM local_audit_events;
         DELETE FROM local_device;
         DELETE FROM local_user;
         DELETE FROM local_workspace;",
    )
}

pub fn apply_bootstrap(app: &AppHandle, bootstrap: &Value) -> Result<(), String> {
    let mut connection = open(app)?;
    let tx = connection
        .transaction()
        .map_err(|_| "Transaction locale impossible.".to_string())?;
    let workspace = bootstrap
        .get("workspace")
        .ok_or_else(|| "Workspace absent du bootstrap.".to_string())?;
    let user = bootstrap
        .get("user")
        .ok_or_else(|| "Utilisateur absent du bootstrap.".to_string())?;
    let workspace_id = string(workspace, "id")?;
    let user_id = string(user, "id")?;
    let current: Option<(String, String)> = tx
        .query_row(
            "SELECT u.id, w.id FROM local_user u CROSS JOIN local_workspace w LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|_| "Contexte local illisible.".to_string())?;
    if current
        .as_ref()
        .is_some_and(|(current_user, current_workspace)| {
            current_user != &user_id || current_workspace != &workspace_id
        })
    {
        purge_clinical_data(&tx).map_err(|_| "Purge inter-workspace impossible.".to_string())?;
    }
    tx.execute(
        "INSERT OR REPLACE INTO local_user(id, full_name, email, role) VALUES (?1, ?2, ?3, ?4)",
        params![user_id, string(user, "fullName")?, string(user, "email")?, string(user, "role")?],
    )
    .map_err(|_| "Utilisateur local non enregistré.".to_string())?;
    tx.execute(
        "INSERT OR REPLACE INTO local_workspace(id, name, workspace_type) VALUES (?1, ?2, ?3)",
        params![workspace_id, string(workspace, "name")?, string(workspace, "type")?],
    )
    .map_err(|_| "Workspace local non enregistré.".to_string())?;
    tx.execute(
        "INSERT OR REPLACE INTO local_device(id, workspace_id) VALUES (?1, ?2)",
        params![string(bootstrap, "deviceId")?, workspace_id],
    )
    .map_err(|_| "Appareil local non enregistré.".to_string())?;
    let synced_at = string(bootstrap, "serverTime")?;

    for patient in bootstrap
        .get("patients")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let id = string(patient, "id")?;
        let search_text = format!(
            "{} {} {} {} {}",
            patient.get("firstName").and_then(Value::as_str).unwrap_or(""),
            patient.get("lastName").and_then(Value::as_str).unwrap_or(""),
            patient.get("firstNameAr").and_then(Value::as_str).unwrap_or(""),
            patient.get("lastNameAr").and_then(Value::as_str).unwrap_or(""),
            patient
                .get("hospitalRecordNumber")
                .and_then(Value::as_str)
                .unwrap_or("")
        )
        .to_lowercase();
        let server_updated = string(patient, "serverUpdatedAt")?;
        tx.execute(
            "INSERT INTO patients(server_id, workspace_id, search_text, payload, server_updated_at, last_synced_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(server_id) DO UPDATE SET search_text=excluded.search_text, payload=excluded.payload,
             server_updated_at=excluded.server_updated_at, last_synced_at=excluded.last_synced_at",
            params![id, workspace_id, search_text, patient.to_string(), server_updated, synced_at],
        )
        .map_err(|_| "Patient local non enregistré.".to_string())?;
        tx.execute(
            "INSERT OR REPLACE INTO patient_medical_summaries(patient_server_id, payload, server_updated_at, last_synced_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![id, patient.get("medicalSummary").unwrap_or(&Value::Null).to_string(), server_updated, synced_at],
        )
        .map_err(|_| "Résumé médical local non enregistré.".to_string())?;
    }
    for consultation in bootstrap
        .get("consultations")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        apply_server_consultation(&tx, consultation, &synced_at, false)?;
    }
    for appointment in bootstrap
        .get("appointments")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        tx.execute(
            "INSERT OR REPLACE INTO appointments_cache(server_id, patient_server_id, payload, server_updated_at, last_synced_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![string(appointment, "id")?, string(appointment, "patientId")?, appointment.to_string(), string(appointment, "updatedAt")?, synced_at],
        )
        .map_err(|_| "Rendez-vous local non enregistré.".to_string())?;
    }
    tx.execute(
        "UPDATE sync_state SET cursor=?1, last_synced_at=?2 WHERE id=1",
        params![string(bootstrap, "syncCursor")?, synced_at],
    )
    .map_err(|_| "Curseur local non enregistré.".to_string())?;
    tx.commit()
        .map_err(|_| "Bootstrap local non validé.".to_string())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatus {
    pub authorized: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<Value>,
}

pub fn session_status(app: &AppHandle, claims: Option<&GrantClaims>) -> Result<SessionStatus, String> {
    let Some(claims) = claims else {
        return Ok(SessionStatus { authorized: false, expires_at: None, workspace: None, user: None });
    };
    let connection = open(app)?;
    let context: Option<(String, String, String, String, String, String)> = connection
        .query_row(
            "SELECT u.id, u.full_name, u.email, w.id, w.name, w.workspace_type
             FROM local_user u CROSS JOIN local_workspace w LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
        )
        .optional()
        .map_err(|_| "Contexte local illisible.".to_string())?;
    let Some((user_id, full_name, email, workspace_id, workspace_name, workspace_type)) = context else {
        return Ok(SessionStatus { authorized: false, expires_at: None, workspace: None, user: None });
    };
    if user_id != claims.user_id || workspace_id != claims.workspace_id {
        return Err("Le grant ne correspond pas au contexte local.".to_string());
    }
    Ok(SessionStatus {
        authorized: true,
        expires_at: Some(claims.exp.to_string()),
        workspace: Some(json!({ "id": workspace_id, "name": workspace_name, "type": workspace_type })),
        user: Some(json!({ "id": user_id, "fullName": full_name, "email": email })),
    })
}

pub fn assert_clock(app: &AppHandle, claims: &GrantClaims) -> Result<(), String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "Horloge système invalide.".to_string())?
        .as_secs() as i64;
    let issued_at = claims.iat as i64;
    let expires_at = claims.exp as i64;
    if now + 300 < issued_at || now > expires_at + 60 {
        return Err("Autorisation offline expirée ou horloge système invalide.".to_string());
    }
    let connection = open(app)?;
    let last_seen: i64 = connection
        .query_row("SELECT last_clock_seen FROM sync_state WHERE id=1", [], |row| row.get(0))
        .map_err(|_| "État de l’horloge locale indisponible.".to_string())?;
    if last_seen > 0 && now + 300 < last_seen {
        return Err("Recul de l’horloge détecté; reconnexion en ligne requise.".to_string());
    }
    connection
        .execute(
            "UPDATE sync_state SET last_clock_seen=MAX(last_clock_seen, ?1) WHERE id=1",
            params![now],
        )
        .map_err(|_| "Contrôle de l’horloge non enregistré.".to_string())?;
    Ok(())
}

pub fn list_patients(app: &AppHandle, query: &str) -> Result<Vec<Value>, String> {
    let connection = open(app)?;
    let pattern = format!("%{}%", query.trim().to_lowercase());
    let mut statement = connection
        .prepare("SELECT payload FROM patients WHERE search_text LIKE ?1 ORDER BY search_text LIMIT 200")
        .map_err(|_| "Recherche locale indisponible.".to_string())?;
    let rows = statement
        .query_map(params![pattern], |row| row.get::<_, String>(0))
        .map_err(|_| "Recherche locale impossible.".to_string())?;
    rows.map(|row| {
        let payload = row.map_err(|_| "Patient local illisible.".to_string())?;
        serde_json::from_str(&payload).map_err(|_| "Patient local corrompu.".to_string())
    })
    .collect()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsultationDraftInput {
    pub local_id: Option<String>,
    pub patient_id: String,
    pub local_status: String,
    pub chief_complaint: String,
    pub history_present_illness: String,
    pub clinical_examination: String,
    pub assessment: String,
    pub care_plan: String,
    pub follow_up_plan: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedDraft {
    pub local_id: String,
    pub operation_id: String,
}

pub fn save_draft(
    app: &AppHandle,
    claims: &GrantClaims,
    input: ConsultationDraftInput,
) -> Result<SavedDraft, String> {
    if !matches!(input.local_status.as_str(), "LOCAL_DRAFT" | "IN_PROGRESS" | "READY_TO_SYNC") {
        return Err("État local de consultation invalide.".to_string());
    }
    let mut connection = open(app)?;
    let occurred_at = now_iso(&connection)?;
    let tx = connection.transaction().map_err(|_| "Transaction locale impossible.".to_string())?;
    let patient_exists: bool = tx
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM patients WHERE server_id=?1)",
            params![input.patient_id],
            |row| row.get(0),
        )
        .map_err(|_| "Patient local introuvable.".to_string())?;
    if !patient_exists {
        return Err("Ce dossier n’est pas disponible hors connexion.".to_string());
    }
    let local_id = input.local_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let existing: Option<(Option<String>, Option<i64>)> = tx
        .query_row(
            "SELECT server_id, base_version FROM consultations WHERE local_id=?1",
            params![local_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|_| "Brouillon local illisible.".to_string())?;
    let (server_id, base_version) = existing.unwrap_or((None, None));
    let payload = json!({
        "patientId": input.patient_id,
        "serverEntityId": server_id,
        "localStatus": input.local_status,
        "chiefComplaint": input.chief_complaint,
        "historyPresentIllness": input.history_present_illness,
        "clinicalExamination": input.clinical_examination,
        "assessment": input.assessment,
        "carePlan": input.care_plan,
        "followUpPlan": input.follow_up_plan,
        "vitalSigns": Value::Null,
        "diagnoses": []
    });
    tx.execute(
        "INSERT INTO consultations(local_id, server_id, patient_server_id, local_status, base_version, payload, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(local_id) DO UPDATE SET local_status=excluded.local_status, payload=excluded.payload, updated_at=excluded.updated_at",
        params![local_id, server_id, input.patient_id, input.local_status, base_version, payload.to_string(), occurred_at],
    )
    .map_err(|_| "Brouillon local non enregistré.".to_string())?;
    let operation = if server_id.is_some() { "UPDATE" } else { "CREATE" };
    let existing_operation: Option<String> = tx
        .query_row(
            "SELECT operation_id FROM sync_outbox WHERE local_entity_id=?1 AND operation=?2 AND status IN ('PENDING','RETRYABLE') ORDER BY sequence LIMIT 1",
            params![local_id, operation],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "Outbox locale illisible.".to_string())?;
    let operation_id = existing_operation.unwrap_or_else(|| Uuid::new_v4().to_string());
    let envelope = json!({
        "operationId": operation_id,
        "entityType": "CONSULTATION",
        "localEntityId": local_id,
        "operation": operation,
        "baseVersion": base_version,
        "occurredAt": occurred_at,
        "payload": payload
    });
    let sequence: i64 = tx
        .query_row("SELECT COALESCE(MAX(sequence), 0) + 1 FROM sync_outbox", [], |row| row.get(0))
        .map_err(|_| "Séquence outbox indisponible.".to_string())?;
    tx.execute(
        "INSERT INTO sync_outbox(operation_id, device_id, entity_type, local_entity_id, operation, base_version, payload, occurred_at, sequence, status)
         VALUES (?1, ?2, 'CONSULTATION', ?3, ?4, ?5, ?6, ?7, ?8, 'PENDING')
         ON CONFLICT(operation_id) DO UPDATE SET base_version=excluded.base_version, payload=excluded.payload, occurred_at=excluded.occurred_at, status='PENDING'",
        params![operation_id, claims.device_id, local_id, operation, base_version, envelope.to_string(), occurred_at, sequence],
    )
    .map_err(|_| "Outbox locale non enregistrée.".to_string())?;
    tx.execute(
        "INSERT INTO local_audit_events(id, action, entity_type, entity_id, actor_id, device_id, occurred_at)
         VALUES (?1, 'CONSULTATION_SAVED_OFFLINE', 'PatientConsultation', ?2, ?3, ?4, ?5)",
        params![Uuid::new_v4().to_string(), local_id, claims.user_id, claims.device_id, occurred_at],
    )
    .map_err(|_| "Audit local non enregistré.".to_string())?;
    tx.commit().map_err(|_| "Brouillon local non validé.".to_string())?;
    Ok(SavedDraft { local_id, operation_id })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub state: String,
    pub pending_count: i64,
    pub conflict_count: i64,
    pub last_synced_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub processed: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<i64>,
}

pub fn sync_status(app: &AppHandle) -> Result<SyncStatus, String> {
    let connection = open(app)?;
    let pending_count = connection
        .query_row("SELECT COUNT(*) FROM sync_outbox WHERE status IN ('PENDING','RETRYABLE')", [], |row| row.get(0))
        .map_err(|_| "État outbox indisponible.".to_string())?;
    let conflict_count = connection
        .query_row("SELECT COUNT(*) FROM sync_conflicts WHERE status='OPEN'", [], |row| row.get(0))
        .map_err(|_| "État des conflits indisponible.".to_string())?;
    let last_synced_at = connection
        .query_row("SELECT last_synced_at FROM sync_state WHERE id=1", [], |row| row.get(0))
        .map_err(|_| "État sync indisponible.".to_string())?;
    Ok(SyncStatus {
        state: if conflict_count > 0 { "CONFLICT" } else { "ONLINE" }.to_string(),
        pending_count,
        conflict_count,
        last_synced_at,
        processed: None,
        total: None,
    })
}

pub fn pending_operations(app: &AppHandle) -> Result<Vec<Value>, String> {
    let connection = open(app)?;
    let mut statement = connection
        .prepare("SELECT payload FROM sync_outbox WHERE status IN ('PENDING','RETRYABLE') ORDER BY sequence LIMIT 50")
        .map_err(|_| "Outbox locale indisponible.".to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|_| "Outbox locale illisible.".to_string())?;
    rows.map(|row| {
        serde_json::from_str(&row.map_err(|_| "Opération locale illisible.".to_string())?)
            .map_err(|_| "Opération locale corrompue.".to_string())
    })
    .collect()
}

pub fn current_cursor(app: &AppHandle) -> Result<String, String> {
    open(app)?
        .query_row("SELECT cursor FROM sync_state WHERE id=1", [], |row| row.get(0))
        .map_err(|_| "Curseur local indisponible.".to_string())
}

pub fn apply_push_results(app: &AppHandle, results: &[Value]) -> Result<(), String> {
    let mut connection = open(app)?;
    let detected_at = now_iso(&connection)?;
    let tx = connection.transaction().map_err(|_| "Transaction locale impossible.".to_string())?;
    for result in results {
        let operation_id = string(result, "operationId")?;
        let status = string(result, "status")?;
        match status.as_str() {
            "ACK" => {
                let local_id = string(result, "localEntityId")?;
                let server_id = string(result, "serverEntityId")?;
                let version = result.get("serverVersion").and_then(Value::as_i64).unwrap_or(1);
                tx.execute("UPDATE sync_outbox SET status='ACK' WHERE operation_id=?1", params![operation_id])
                    .map_err(|_| "ACK local impossible.".to_string())?;
                tx.execute(
                    "UPDATE consultations SET server_id=?1, base_version=?2, local_status='SYNCED', last_synced_at=?3 WHERE local_id=?4",
                    params![server_id, version, detected_at, local_id],
                ).map_err(|_| "Consultation locale non acquittée.".to_string())?;
                tx.execute(
                    "INSERT OR REPLACE INTO sync_entity_map(entity_type, local_entity_id, server_entity_id) VALUES ('CONSULTATION', ?1, ?2)",
                    params![local_id, server_id],
                ).map_err(|_| "Mapping local non enregistré.".to_string())?;
                tx.execute("UPDATE local_audit_events SET synced_at=?1 WHERE entity_id=?2 AND synced_at IS NULL", params![detected_at, local_id])
                    .map_err(|_| "Audit local non acquitté.".to_string())?;
            }
            "CONFLICT" => {
                let local_id = string(result, "localEntityId")?;
                tx.execute("UPDATE sync_outbox SET status='CONFLICT' WHERE operation_id=?1", params![operation_id])
                    .map_err(|_| "Conflit outbox non enregistré.".to_string())?;
                tx.execute(
                    "INSERT INTO sync_conflicts(id, entity_type, entity_id, local_version, server_version, local_payload, server_payload, detected_at, status)
                     VALUES (?1, 'CONSULTATION', ?2, ?3, ?4, ?5, ?6, ?7, 'OPEN')",
                    params![Uuid::new_v4().to_string(), local_id, result.get("localVersion").and_then(Value::as_i64), result.get("serverVersion").and_then(Value::as_i64), result.get("localPayload").unwrap_or(&Value::Null).to_string(), result.get("serverPayload").unwrap_or(&Value::Null).to_string(), detected_at],
                ).map_err(|_| "Conflit local non enregistré.".to_string())?;
            }
            "REJECTED" => {
                tx.execute("UPDATE sync_outbox SET status='REJECTED' WHERE operation_id=?1", params![operation_id])
                    .map_err(|_| "Rejet local non enregistré.".to_string())?;
            }
            "RETRYABLE" => {
                tx.execute("UPDATE sync_outbox SET status='RETRYABLE', retry_count=retry_count+1 WHERE operation_id=?1", params![operation_id])
                    .map_err(|_| "Retry local non enregistré.".to_string())?;
            }
            _ => return Err("Résultat de synchronisation inconnu.".to_string()),
        }
    }
    tx.commit().map_err(|_| "Résultats push non validés.".to_string())
}

pub fn apply_pull(app: &AppHandle, response: &Value) -> Result<String, String> {
    let mut connection = open(app)?;
    let synced_at = string(response, "serverTime")?;
    let tx = connection.transaction().map_err(|_| "Transaction locale impossible.".to_string())?;
    for change in response.get("changes").and_then(Value::as_array).into_iter().flatten() {
        if string(change, "entityType")? != "CONSULTATION" { continue; }
        if string(change, "operation")? == "TOMBSTONE" {
            let server_id = string(change, "entityId")?;
            tx.execute("DELETE FROM consultations WHERE server_id=?1", params![server_id])
                .map_err(|_| "Tombstone local non appliqué.".to_string())?;
            continue;
        }
        let payload = change.get("payload").ok_or_else(|| "Payload pull absent.".to_string())?;
        apply_server_consultation(&tx, payload, &synced_at, true)?;
    }
    let cursor = string(response, "nextCursor")?;
    tx.execute("UPDATE sync_state SET cursor=?1, last_synced_at=?2 WHERE id=1", params![cursor, synced_at])
        .map_err(|_| "Curseur pull non enregistré.".to_string())?;
    tx.commit().map_err(|_| "Pull local non validé.".to_string())?;
    Ok(cursor)
}

fn apply_server_consultation(
    tx: &Transaction<'_>,
    payload: &Value,
    synced_at: &str,
    detect_pending: bool,
) -> Result<(), String> {
    let server_id = string(payload, "id")?;
    let existing: Option<String> = tx
        .query_row("SELECT local_id FROM consultations WHERE server_id=?1", params![server_id], |row| row.get(0))
        .optional().map_err(|_| "Consultation locale illisible.".to_string())?;
    let local_id = existing.unwrap_or_else(|| Uuid::new_v4().to_string());
    if detect_pending {
        let pending: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM sync_outbox WHERE local_entity_id=?1 AND status IN ('PENDING','RETRYABLE'))",
            params![local_id], |row| row.get(0),
        ).map_err(|_| "Outbox consultation illisible.".to_string())?;
        if pending {
            tx.execute(
                "INSERT INTO sync_conflicts(id, entity_type, entity_id, local_version, server_version, local_payload, server_payload, detected_at, status)
                 SELECT ?1, 'CONSULTATION', local_id, base_version, ?2, payload, ?3, ?4, 'OPEN' FROM consultations WHERE local_id=?5",
                params![Uuid::new_v4().to_string(), payload.get("syncVersion").and_then(Value::as_i64), payload.to_string(), synced_at, local_id],
            ).map_err(|_| "Conflit pull non enregistré.".to_string())?;
            return Ok(());
        }
    }
    tx.execute(
        "INSERT INTO consultations(local_id, server_id, patient_server_id, local_status, base_version, payload, server_updated_at, last_synced_at, updated_at)
         VALUES (?1, ?2, ?3, 'SYNCED', ?4, ?5, ?6, ?7, ?6)
         ON CONFLICT(local_id) DO UPDATE SET server_id=excluded.server_id, local_status='SYNCED', base_version=excluded.base_version,
         payload=excluded.payload, server_updated_at=excluded.server_updated_at, last_synced_at=excluded.last_synced_at, updated_at=excluded.updated_at",
        params![local_id, server_id, string(payload, "patientId")?, payload.get("syncVersion").and_then(Value::as_i64).unwrap_or(1), payload.to_string(), string(payload, "updatedAt")?, synced_at],
    ).map_err(|_| "Consultation serveur non appliquée.".to_string())?;
    tx.execute(
        "INSERT OR REPLACE INTO sync_entity_map(entity_type, local_entity_id, server_entity_id) VALUES ('CONSULTATION', ?1, ?2)",
        params![local_id, server_id],
    ).map_err(|_| "Mapping consultation non appliqué.".to_string())?;
    Ok(())
}
