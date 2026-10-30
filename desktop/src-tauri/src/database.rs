use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
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
  last_synced_at TEXT NOT NULL,
  locked INTEGER NOT NULL DEFAULT 0,
  lock_reason TEXT
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
  local_id TEXT PRIMARY KEY,
  server_id TEXT UNIQUE,
  patient_server_id TEXT NOT NULL,
  encounter_server_id TEXT,
  local_status TEXT NOT NULL DEFAULT 'LOCAL_DRAFT',
  server_status TEXT,
  base_version INTEGER,
  prescription_type TEXT NOT NULL DEFAULT 'STANDARD',
  valid_until TEXT,
  regulatory_data TEXT,
  number TEXT,
  payload TEXT NOT NULL,
  server_updated_at TEXT,
  last_synced_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prescription_items (
  id TEXT PRIMARY KEY,
  prescription_local_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  payload TEXT NOT NULL,
  FOREIGN KEY(prescription_local_id) REFERENCES prescription_drafts(local_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS prescription_items_local_position_idx ON prescription_items(prescription_local_id, position);
CREATE TABLE IF NOT EXISTS medication_reference_cache (
  id TEXT PRIMARY KEY,
  dci TEXT NOT NULL,
  brand_name TEXT,
  strength TEXT NOT NULL,
  pharmaceutical_form TEXT NOT NULL,
  route TEXT NOT NULL,
  manufacturer TEXT,
  regulatory_category TEXT NOT NULL,
  active INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  search_text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS medication_reference_cache_search_idx ON medication_reference_cache(search_text);
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
  retry_count INTEGER NOT NULL DEFAULT 0,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  first_attempted_at TEXT,
  last_attempted_at TEXT
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

// Columns added after the first release; CREATE TABLE IF NOT EXISTS cannot
// upgrade an existing database file, so opening the storage rechecks them.
const LOCAL_MIGRATIONS: [(&str, &str, &str); 17] = [
    (
        "patients",
        "locked",
        "ALTER TABLE patients ADD COLUMN locked INTEGER NOT NULL DEFAULT 0",
    ),
    (
        "patients",
        "lock_reason",
        "ALTER TABLE patients ADD COLUMN lock_reason TEXT",
    ),
    ("prescription_drafts", "server_id", "ALTER TABLE prescription_drafts ADD COLUMN server_id TEXT"),
    ("prescription_drafts", "encounter_server_id", "ALTER TABLE prescription_drafts ADD COLUMN encounter_server_id TEXT"),
    ("prescription_drafts", "local_status", "ALTER TABLE prescription_drafts ADD COLUMN local_status TEXT NOT NULL DEFAULT 'LOCAL_DRAFT'"),
    ("prescription_drafts", "server_status", "ALTER TABLE prescription_drafts ADD COLUMN server_status TEXT"),
    ("prescription_drafts", "base_version", "ALTER TABLE prescription_drafts ADD COLUMN base_version INTEGER"),
    ("prescription_drafts", "prescription_type", "ALTER TABLE prescription_drafts ADD COLUMN prescription_type TEXT NOT NULL DEFAULT 'STANDARD'"),
    ("prescription_drafts", "valid_until", "ALTER TABLE prescription_drafts ADD COLUMN valid_until TEXT"),
    ("prescription_drafts", "regulatory_data", "ALTER TABLE prescription_drafts ADD COLUMN regulatory_data TEXT"),
    ("prescription_drafts", "number", "ALTER TABLE prescription_drafts ADD COLUMN number TEXT"),
    ("prescription_drafts", "server_updated_at", "ALTER TABLE prescription_drafts ADD COLUMN server_updated_at TEXT"),
    ("prescription_drafts", "last_synced_at", "ALTER TABLE prescription_drafts ADD COLUMN last_synced_at TEXT"),
    ("prescription_drafts", "updated_at", "ALTER TABLE prescription_drafts ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''"),
    // Existing rows predate durable attempt tracking. Their send history is
    // unknowable, so they are deliberately treated as possibly sent.
    ("sync_outbox", "attempt_count", "ALTER TABLE sync_outbox ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 1"),
    ("sync_outbox", "first_attempted_at", "ALTER TABLE sync_outbox ADD COLUMN first_attempted_at TEXT"),
    ("sync_outbox", "last_attempted_at", "ALTER TABLE sync_outbox ADD COLUMN last_attempted_at TEXT"),
];

// What the storage layer needs from its host: the folder of the encrypted
// database. The Tauri application derives it from its AppHandle; the offline
// reliability harness points it at a throw-away profile, so the very same
// engine runs without a window, a webview or the OS data folder.
pub struct EngineEnv {
    data_dir: Result<PathBuf, String>,
}

impl EngineEnv {
    pub fn from_app(app: &AppHandle) -> Self {
        Self {
            data_dir: app
                .path()
                .app_data_dir()
                .map_err(|_| "Répertoire de données local indisponible.".to_string()),
        }
    }

    #[cfg(feature = "e2e-harness")]
    pub fn from_dir(data_dir: PathBuf) -> Self {
        Self {
            data_dir: Ok(data_dir),
        }
    }
}

fn db_path(app: &EngineEnv) -> Result<PathBuf, String> {
    let directory = app.data_dir.as_ref().map_err(String::clone)?;
    fs::create_dir_all(directory)
        .map_err(|_| "Impossible de créer le répertoire local.".to_string())?;
    Ok(directory.join("healixdz-offline-v1.db"))
}

pub fn open(app: &EngineEnv) -> Result<Connection, String> {
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
    apply_local_migrations(&connection)
        .map_err(|_| "Mise à niveau locale impossible.".to_string())?;
    Ok(connection)
}

fn apply_local_migrations(connection: &Connection) -> rusqlite::Result<()> {
    for (table, column, ddl) in LOCAL_MIGRATIONS {
        let present: i64 = connection.query_row(
            &format!("SELECT COUNT(*) FROM pragma_table_info('{table}') WHERE name = ?1"),
            params![column],
            |row| row.get(0),
        )?;
        if present == 0 {
            connection.execute(ddl, [])?;
        }
    }
    connection.execute_batch(
        "CREATE UNIQUE INDEX IF NOT EXISTS prescription_drafts_server_id_idx
           ON prescription_drafts(server_id) WHERE server_id IS NOT NULL;
         CREATE INDEX IF NOT EXISTS prescription_drafts_patient_idx
           ON prescription_drafts(patient_server_id, updated_at);",
    )?;
    Ok(())
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
        .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |row| {
            row.get(0)
        })
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

pub fn apply_bootstrap(app: &EngineEnv, bootstrap: &Value) -> Result<(), String> {
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
        params![
            user_id,
            string(user, "fullName")?,
            string(user, "email")?,
            string(user, "role")?
        ],
    )
    .map_err(|_| "Utilisateur local non enregistré.".to_string())?;
    tx.execute(
        "INSERT OR REPLACE INTO local_workspace(id, name, workspace_type) VALUES (?1, ?2, ?3)",
        params![
            workspace_id,
            string(workspace, "name")?,
            string(workspace, "type")?
        ],
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
            patient
                .get("firstName")
                .and_then(Value::as_str)
                .unwrap_or(""),
            patient
                .get("lastName")
                .and_then(Value::as_str)
                .unwrap_or(""),
            patient
                .get("firstNameAr")
                .and_then(Value::as_str)
                .unwrap_or(""),
            patient
                .get("lastNameAr")
                .and_then(Value::as_str)
                .unwrap_or(""),
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
    // Bootstrap contains only the actor's server DRAFTs. Terminal orders
    // arrive through the change feed, but these editable drafts must be
    // present before the desktop first goes offline.
    for prescription in bootstrap
        .get("prescriptions")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        apply_server_prescription(&tx, prescription, &synced_at, false)?;
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
    // The received patient list IS the authorization set: locally cached
    // patients absent from it are purged (or locked when they hold unsent
    // clinical data) inside this same transaction.
    let authorized: Vec<String> = bootstrap
        .get("authorizedPatientIds")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_string)
        .collect();
    reconcile_patients_tx(&tx, &authorized)
        .map_err(|_| "Patients hors scope non purgés.".to_string())?;
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

pub fn session_status(
    app: &EngineEnv,
    claims: Option<&GrantClaims>,
) -> Result<SessionStatus, String> {
    let Some(claims) = claims else {
        return Ok(SessionStatus {
            authorized: false,
            expires_at: None,
            workspace: None,
            user: None,
        });
    };
    let connection = open(app)?;
    let context: Option<(String, String, String, String, String, String)> = connection
        .query_row(
            "SELECT u.id, u.full_name, u.email, w.id, w.name, w.workspace_type
             FROM local_user u CROSS JOIN local_workspace w LIMIT 1",
            [],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            },
        )
        .optional()
        .map_err(|_| "Contexte local illisible.".to_string())?;
    let Some((user_id, full_name, email, workspace_id, workspace_name, workspace_type)) = context
    else {
        return Ok(SessionStatus {
            authorized: false,
            expires_at: None,
            workspace: None,
            user: None,
        });
    };
    if user_id != claims.user_id || workspace_id != claims.workspace_id {
        return Err("Le grant ne correspond pas au contexte local.".to_string());
    }
    Ok(SessionStatus {
        authorized: true,
        expires_at: Some(claims.exp.to_string()),
        workspace: Some(
            json!({ "id": workspace_id, "name": workspace_name, "type": workspace_type }),
        ),
        user: Some(json!({ "id": user_id, "fullName": full_name, "email": email })),
    })
}

pub fn assert_clock(app: &EngineEnv, claims: &GrantClaims) -> Result<(), String> {
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
        .query_row(
            "SELECT last_clock_seen FROM sync_state WHERE id=1",
            [],
            |row| row.get(0),
        )
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

pub fn list_patients(app: &EngineEnv, query: &str) -> Result<Vec<Value>, String> {
    let connection = open(app)?;
    let pattern = format!("%{}%", query.trim().to_lowercase());
    let mut statement = connection
        .prepare(
            "SELECT payload, locked, lock_reason FROM patients
             WHERE search_text LIKE ?1 ORDER BY search_text LIMIT 200",
        )
        .map_err(|_| "Recherche locale indisponible.".to_string())?;
    let rows = statement
        .query_map(params![pattern], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(|_| "Recherche locale impossible.".to_string())?;
    rows.map(|row| {
        let (payload, locked, lock_reason) =
            row.map_err(|_| "Patient local illisible.".to_string())?;
        let mut value: Value =
            serde_json::from_str(&payload).map_err(|_| "Patient local corrompu.".to_string())?;
        if locked != 0 {
            value["locked"] = Value::Bool(true);
            value["lockReason"] =
                Value::String(lock_reason.unwrap_or_else(|| "LOCKED".to_string()));
        }
        Ok(value)
    })
    .collect()
}

// The medication catalogue remains inside SQLCipher. It is deliberately a
// read-only UX cache: push still sends medicationId and the backend reloads
// the authoritative MedicationReference before it creates/updates a draft.
pub fn apply_medication_catalog(app: &EngineEnv, response: &Value) -> Result<(), String> {
    let medications = response
        .get("medications")
        .and_then(Value::as_array)
        .ok_or_else(|| "Catalogue de médicaments absent.".to_string())?;
    let mut connection = open(app)?;
    let tx = connection
        .transaction()
        .map_err(|_| "Transaction catalogue impossible.".to_string())?;
    tx.execute("DELETE FROM medication_reference_cache", [])
        .map_err(|_| "Catalogue local non actualisé.".to_string())?;
    for medication in medications {
        let dci = string(medication, "dci")?;
        let brand_name = medication
            .get("brandName")
            .and_then(Value::as_str)
            .map(str::to_string);
        let strength = string(medication, "strength")?;
        let search_text = format!(
            "{} {} {}",
            dci,
            brand_name.as_deref().unwrap_or_default(),
            strength
        )
        .to_lowercase();
        tx.execute(
            "INSERT INTO medication_reference_cache(
               id, dci, brand_name, strength, pharmaceutical_form, route,
               manufacturer, regulatory_category, active, updated_at, search_text
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                string(medication, "id")?,
                dci,
                brand_name,
                strength,
                string(medication, "pharmaceuticalForm")?,
                string(medication, "route")?,
                medication.get("manufacturer").and_then(Value::as_str),
                string(medication, "regulatoryCategory")?,
                medication
                    .get("active")
                    .and_then(Value::as_bool)
                    .unwrap_or(true) as i64,
                string(medication, "updatedAt")?,
                search_text,
            ],
        )
        .map_err(|_| "Médicament local non enregistré.".to_string())?;
    }
    tx.commit()
        .map_err(|_| "Catalogue local non validé.".to_string())
}

pub fn search_local_medications(app: &EngineEnv, query: &str) -> Result<Vec<Value>, String> {
    let connection = open(app)?;
    let query = query.trim().to_lowercase();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let pattern = format!("%{query}%");
    let mut statement = connection
        .prepare(
            "SELECT id, dci, brand_name, strength, pharmaceutical_form, route,
                    manufacturer, regulatory_category, active, updated_at
             FROM medication_reference_cache
             WHERE active=1 AND search_text LIKE ?1
             ORDER BY dci, brand_name, strength LIMIT 25",
        )
        .map_err(|_| "Recherche médicament indisponible.".to_string())?;
    let rows = statement
        .query_map(params![pattern], |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "dci": row.get::<_, String>(1)?,
                "brandName": row.get::<_, Option<String>>(2)?,
                "strength": row.get::<_, String>(3)?,
                "pharmaceuticalForm": row.get::<_, String>(4)?,
                "route": row.get::<_, String>(5)?,
                "manufacturer": row.get::<_, Option<String>>(6)?,
                "regulatoryCategory": row.get::<_, String>(7)?,
                "active": row.get::<_, i64>(8)? != 0,
                "updatedAt": row.get::<_, String>(9)?,
            }))
        })
        .map_err(|_| "Recherche médicament impossible.".to_string())?;
    rows.map(|row| row.map_err(|_| "Médicament local illisible.".to_string()))
        .collect()
}

// ---- Scope reconciliation -------------------------------------------------

// Unsent clinical data for one patient: any outbox entry that is not
// acknowledged (PENDING/RETRYABLE, but also CONFLICT and REJECTED: the Cloud
// refused them, it never stored them) or an OPEN conflict on a cached
// consultation or prescription. They must survive a scope leave, so the
// decision never destroys them silently: once the Cloud has rejected an
// operation for a patient who left the scope, the next session would
// otherwise find "nothing pending" and purge the only copy of that work.
fn patient_unsent_state(tx: &Transaction<'_>, patient_id: &str) -> rusqlite::Result<(bool, bool)> {
    let pending: bool = tx.query_row(
        "SELECT EXISTS(
           SELECT 1 FROM sync_outbox
           WHERE entity_type IN ('CONSULTATION', 'PRESCRIPTION')
             AND status <> 'ACK'
             AND local_entity_id IN (
               SELECT local_id FROM consultations WHERE patient_server_id=?1
               UNION ALL
               SELECT local_id FROM prescription_drafts WHERE patient_server_id=?1
             )
         )",
        params![patient_id],
        |row| row.get(0),
    )?;
    let conflicted: bool = tx.query_row(
        "SELECT EXISTS(
           SELECT 1 FROM sync_conflicts
           WHERE entity_type IN ('CONSULTATION', 'PRESCRIPTION') AND status='OPEN'
             AND entity_id IN (
               SELECT local_id FROM consultations WHERE patient_server_id=?1
               UNION ALL
               SELECT local_id FROM prescription_drafts WHERE patient_server_id=?1
             )
         )",
        params![patient_id],
        |row| row.get(0),
    )?;
    Ok((pending, conflicted))
}

// Deletes every local trace of one patient: the cache row, its summary, its
// appointment cache and its synced consultations (vitals/diagnoses follow
// through the foreign keys). Only data of this patient is touched: the
// outbox and conflicts of other entities and workspaces stay as they are.
fn purge_patient(tx: &Transaction<'_>, patient_id: &str) -> rusqlite::Result<()> {
    tx.execute(
        "DELETE FROM sync_outbox
         WHERE entity_type='CONSULTATION'
           AND local_entity_id IN (
             SELECT local_id FROM consultations WHERE patient_server_id=?1
           )",
        params![patient_id],
    )?;
    tx.execute(
        "DELETE FROM sync_outbox
         WHERE entity_type='PRESCRIPTION'
           AND local_entity_id IN (
             SELECT local_id FROM prescription_drafts WHERE patient_server_id=?1
           )",
        params![patient_id],
    )?;
    tx.execute(
        "DELETE FROM sync_conflicts
         WHERE entity_type='CONSULTATION'
           AND entity_id IN (
             SELECT local_id FROM consultations WHERE patient_server_id=?1
           )",
        params![patient_id],
    )?;
    tx.execute(
        "DELETE FROM sync_conflicts
         WHERE entity_type='PRESCRIPTION'
           AND entity_id IN (
             SELECT local_id FROM prescription_drafts WHERE patient_server_id=?1
           )",
        params![patient_id],
    )?;
    tx.execute(
        "DELETE FROM sync_entity_map
         WHERE entity_type='CONSULTATION'
           AND server_entity_id IN (
             SELECT server_id FROM consultations WHERE patient_server_id=?1
           )",
        params![patient_id],
    )?;
    tx.execute(
        "DELETE FROM sync_entity_map
         WHERE entity_type='PRESCRIPTION'
           AND server_entity_id IN (
             SELECT server_id FROM prescription_drafts WHERE patient_server_id=?1
           )",
        params![patient_id],
    )?;
    tx.execute(
        "DELETE FROM sync_metadata
         WHERE entity_type='CONSULTATION'
           AND entity_id IN (
             SELECT local_id FROM consultations WHERE patient_server_id=?1
           )",
        params![patient_id],
    )?;
    tx.execute(
        "DELETE FROM sync_metadata
         WHERE entity_type='PRESCRIPTION'
           AND entity_id IN (
             SELECT local_id FROM prescription_drafts WHERE patient_server_id=?1
           )",
        params![patient_id],
    )?;
    tx.execute(
        "DELETE FROM prescription_drafts WHERE patient_server_id=?1",
        params![patient_id],
    )?;
    tx.execute(
        "DELETE FROM consultations WHERE patient_server_id=?1",
        params![patient_id],
    )?;
    tx.execute(
        "DELETE FROM appointments_cache WHERE patient_server_id=?1",
        params![patient_id],
    )?;
    tx.execute(
        "DELETE FROM patient_medical_summaries WHERE patient_server_id=?1",
        params![patient_id],
    )?;
    tx.execute(
        "DELETE FROM sync_metadata WHERE entity_type='PATIENT' AND entity_id=?1",
        params![patient_id],
    )?;
    tx.execute(
        "DELETE FROM patients WHERE server_id=?1",
        params![patient_id],
    )?;
    Ok(())
}

// Locks the folder instead of destroying unsent data.
fn lock_patient(tx: &Transaction<'_>, patient_id: &str, reason: &str) -> rusqlite::Result<()> {
    tx.execute(
        "UPDATE patients SET locked=1, lock_reason=?2 WHERE server_id=?1",
        params![patient_id, reason],
    )?;
    Ok(())
}

// The server decides; the storage applies. Patients the server still
// authorizes are unlocked (a re-authorized folder opens again), the rest is
// purged when clean and locked when it holds unsent data.
pub fn reconcile_patients_tx(
    tx: &Transaction<'_>,
    authorized_patient_ids: &[String],
) -> rusqlite::Result<()> {
    let authorized: std::collections::HashSet<&String> = authorized_patient_ids.iter().collect();
    for row in tx
        .prepare("SELECT server_id FROM patients")?
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?
    {
        if authorized.contains(&row) {
            tx.execute(
                "UPDATE patients SET locked=0, lock_reason=NULL WHERE server_id=?1",
                params![row],
            )?;
            continue;
        }
        let (pending, conflicted) = patient_unsent_state(tx, &row)?;
        match crate::protocol::decide_removal(pending, conflicted) {
            crate::protocol::ScopeRemoval::Purge => purge_patient(tx, &row)?,
            crate::protocol::ScopeRemoval::Lock => {
                lock_patient(tx, &row, crate::protocol::SCOPE_REVOKED_LOCK_REASON)?
            }
        }
    }
    Ok(())
}

// The result of POST /sync/reconcile: the server-authoritative patient set.
pub fn apply_reconcile(app: &EngineEnv, response: &Value) -> Result<(), String> {
    let authorized: Vec<String> = response
        .get("authorizedPatientIds")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|value| {
            value
                .as_str()
                .map(str::to_string)
                .ok_or_else(|| "Liste de patients serveur invalide.".to_string())
        })
        .collect::<Result<Vec<_>, String>>()?;
    let synced_at = string(response, "serverTime")?;
    let mut connection = open(app)?;
    let tx = connection
        .transaction()
        .map_err(|_| "Transaction locale impossible.".to_string())?;
    reconcile_patients_tx(&tx, &authorized)
        .map_err(|_| "Purge des patients sortis du scope impossible.".to_string())?;
    tx.execute(
        "UPDATE sync_state SET last_synced_at=?1 WHERE id=1",
        params![synced_at],
    )
    .map_err(|_| "État de synchronisation non enregistré.".to_string())?;
    tx.commit()
        .map_err(|_| "Réconciliation locale non validée.".to_string())
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
    app: &EngineEnv,
    claims: &GrantClaims,
    input: ConsultationDraftInput,
) -> Result<SavedDraft, String> {
    if !matches!(
        input.local_status.as_str(),
        "LOCAL_DRAFT" | "IN_PROGRESS" | "READY_TO_SYNC"
    ) {
        return Err("État local de consultation invalide.".to_string());
    }
    let mut connection = open(app)?;
    let occurred_at = now_iso(&connection)?;
    let tx = connection
        .transaction()
        .map_err(|_| "Transaction locale impossible.".to_string())?;
    let patient_state: Option<i64> = tx
        .query_row(
            "SELECT locked FROM patients WHERE server_id=?1",
            params![input.patient_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "Patient local introuvable.".to_string())?;
    let Some(patient_locked) = patient_state else {
        return Err("Ce dossier n’est pas disponible hors connexion.".to_string());
    };
    if patient_locked != 0 {
        return Err(
            "Dossier verrouillé hors périmètre autorisé; modification interdite.".to_string(),
        );
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
    let operation = if server_id.is_some() {
        "UPDATE"
    } else {
        "CREATE"
    };
    let mutable_operation: Option<String> = tx
        .query_row(
            "SELECT operation_id FROM sync_outbox WHERE entity_type='CONSULTATION' AND local_entity_id=?1 AND operation=?2 AND status IN ('PENDING','RETRYABLE') AND attempt_count=0 ORDER BY sequence LIMIT 1",
            params![local_id, operation],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "Outbox locale illisible.".to_string())?;
    let attempted_operation: Option<String> = if mutable_operation.is_none() {
        tx.query_row(
            "SELECT operation_id FROM sync_outbox WHERE entity_type='CONSULTATION' AND local_entity_id=?1 AND status IN ('PENDING','RETRYABLE') AND attempt_count>0 ORDER BY sequence LIMIT 1",
            params![local_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "Outbox locale illisible.".to_string())?
    } else {
        None
    };
    let operation_id = mutable_operation
        .clone()
        .or_else(|| attempted_operation.clone())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    // A previous network attempt freezes its operation envelope. The freshly
    // saved aggregate remains local until that operation receives an ACK.
    if attempted_operation.is_none() {
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
            .query_row(
                "SELECT COALESCE(MAX(sequence), 0) + 1 FROM sync_outbox",
                [],
                |row| row.get(0),
            )
            .map_err(|_| "Séquence outbox indisponible.".to_string())?;
        tx.execute(
        "INSERT INTO sync_outbox(operation_id, device_id, entity_type, local_entity_id, operation, base_version, payload, occurred_at, sequence, status, attempt_count)
         VALUES (?1, ?2, 'CONSULTATION', ?3, ?4, ?5, ?6, ?7, ?8, 'PENDING', 0)
         ON CONFLICT(operation_id) DO UPDATE SET base_version=excluded.base_version, payload=excluded.payload, occurred_at=excluded.occurred_at, status='PENDING'",
        params![operation_id, claims.device_id, local_id, operation, base_version, envelope.to_string(), occurred_at, sequence],
    )
    .map_err(|_| "Outbox locale non enregistrée.".to_string())?;
    }
    tx.execute(
        "INSERT INTO local_audit_events(id, action, entity_type, entity_id, actor_id, device_id, occurred_at)
         VALUES (?1, 'CONSULTATION_SAVED_OFFLINE', 'PatientConsultation', ?2, ?3, ?4, ?5)",
        params![Uuid::new_v4().to_string(), local_id, claims.user_id, claims.device_id, occurred_at],
    )
    .map_err(|_| "Audit local non enregistré.".to_string())?;
    tx.commit()
        .map_err(|_| "Brouillon local non validé.".to_string())?;
    Ok(SavedDraft {
        local_id,
        operation_id,
    })
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrescriptionItemInput {
    pub medication_id: Option<String>,
    pub dci: String,
    pub brand_name: Option<String>,
    pub strength: String,
    pub pharmaceutical_form: String,
    pub route: String,
    pub manufacturer: Option<String>,
    pub regulatory_category: String,
    pub dose_per_intake: String,
    pub frequency: String,
    pub intake_moment: Option<String>,
    pub duration_days: Option<i64>,
    pub quantity: String,
    pub patient_instructions: Option<String>,
    pub indication: Option<String>,
    #[serde(default)]
    pub as_needed: bool,
    #[serde(default)]
    pub renewal_allowed: bool,
    #[serde(default)]
    pub substitution_allowed: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrescriptionDraftInput {
    pub local_id: Option<String>,
    pub patient_id: String,
    pub encounter_id: Option<String>,
    #[serde(rename = "type")]
    pub prescription_type: String,
    pub valid_until: Option<String>,
    pub regulatory: Option<Value>,
    pub items: Vec<PrescriptionItemInput>,
}

fn validate_prescription_input(input: &PrescriptionDraftInput) -> Result<(), String> {
    if input.prescription_type.trim().is_empty() {
        return Err("Type d’ordonnance requis.".to_string());
    }
    if input.items.is_empty() {
        return Err("Une ordonnance doit contenir au moins un médicament.".to_string());
    }
    for item in &input.items {
        if item.dci.trim().is_empty()
            || item.strength.trim().is_empty()
            || item.dose_per_intake.trim().is_empty()
            || item.frequency.trim().is_empty()
            || item.quantity.trim().is_empty()
        {
            return Err("DCI, dosage, prise, fréquence et quantité sont requis.".to_string());
        }
        if item.pharmaceutical_form.trim().is_empty()
            || item.route.trim().is_empty()
            || item.regulatory_category.trim().is_empty()
        {
            return Err(
                "La forme, la voie et la catégorie réglementaire sont requises.".to_string(),
            );
        }
        if item.duration_days.is_some_and(|duration| duration <= 0) {
            return Err("La durée doit être positive lorsqu’elle est renseignée.".to_string());
        }
    }
    Ok(())
}

fn prescription_payload(input: &PrescriptionDraftInput, server_id: Option<&str>) -> Value {
    json!({
        "patientId": input.patient_id,
        "serverEntityId": server_id,
        "encounterId": input.encounter_id,
        "type": input.prescription_type,
        "validUntil": input.valid_until,
        "regulatory": input.regulatory,
        "items": input.items,
    })
}

fn replace_prescription_items(
    tx: &Transaction<'_>,
    local_id: &str,
    items: &[PrescriptionItemInput],
) -> Result<(), String> {
    tx.execute(
        "DELETE FROM prescription_items WHERE prescription_local_id=?1",
        params![local_id],
    )
    .map_err(|_| "Items d’ordonnance non actualisés.".to_string())?;
    for (position, item) in items.iter().enumerate() {
        tx.execute(
            "INSERT INTO prescription_items(id, prescription_local_id, position, payload)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                Uuid::new_v4().to_string(),
                local_id,
                position as i64,
                serde_json::to_string(item)
                    .map_err(|_| "Item d’ordonnance invalide.".to_string())?,
            ],
        )
        .map_err(|_| "Item d’ordonnance non enregistré.".to_string())?;
    }
    Ok(())
}

pub fn save_prescription_draft(
    app: &EngineEnv,
    claims: &GrantClaims,
    input: PrescriptionDraftInput,
) -> Result<SavedDraft, String> {
    let mut connection = open(app)?;
    save_prescription_draft_on_connection(&mut connection, claims, input)
}

fn save_prescription_draft_on_connection(
    connection: &mut Connection,
    claims: &GrantClaims,
    input: PrescriptionDraftInput,
) -> Result<SavedDraft, String> {
    validate_prescription_input(&input)?;
    let occurred_at = now_iso(connection)?;
    let tx = connection
        .transaction()
        .map_err(|_| "Transaction ordonnance impossible.".to_string())?;
    let patient_locked: Option<i64> = tx
        .query_row(
            "SELECT locked FROM patients WHERE server_id=?1",
            params![input.patient_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "Patient local introuvable.".to_string())?;
    match patient_locked {
        Some(0) => {}
        Some(_) => return Err("Dossier verrouillé : ordonnance non modifiable.".to_string()),
        None => return Err("Ce dossier n’est pas disponible hors connexion.".to_string()),
    }

    let local_id = input
        .local_id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let existing: Option<(String, Option<String>, Option<i64>, Option<String>, String)> = tx
        .query_row(
            "SELECT patient_server_id, server_id, base_version, server_status, local_status
             FROM prescription_drafts WHERE local_id=?1",
            params![local_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )
        .optional()
        .map_err(|_| "Brouillon d’ordonnance illisible.".to_string())?;
    if let Some((patient_id, server_id, base_version, server_status, local_status)) = &existing {
        if patient_id != &input.patient_id {
            return Err("Le patient d’une ordonnance existante ne peut pas changer.".to_string());
        }
        if matches!(local_status.as_str(), "CONFLICT" | "READ_ONLY") {
            return Err(
                "Cette ordonnance nécessite une résolution ou est en lecture seule.".to_string(),
            );
        }
        if server_id.is_some()
            && (server_status.as_deref() != Some("DRAFT") || base_version.is_none())
        {
            return Err(
                "Seuls les brouillons serveur peuvent être modifiés hors ligne.".to_string(),
            );
        }
    }

    let (server_id, base_version, operation) = existing
        .as_ref()
        .map(|(_, id, version, _, _)| {
            (
                id.clone(),
                *version,
                if id.is_some() { "UPDATE" } else { "CREATE" },
            )
        })
        .unwrap_or((None, None, "CREATE"));
    let payload = prescription_payload(&input, server_id.as_deref());
    if existing.is_some() {
        tx.execute(
            "UPDATE prescription_drafts SET encounter_server_id=?2, local_status='PENDING_SYNC',
             prescription_type=?3, valid_until=?4, regulatory_data=?5, payload=?6, updated_at=?7
             WHERE local_id=?1",
            params![
                local_id,
                input.encounter_id,
                input.prescription_type,
                input.valid_until,
                input.regulatory.as_ref().map(Value::to_string),
                payload.to_string(),
                occurred_at,
            ],
        )
        .map_err(|_| "Brouillon d’ordonnance non actualisé.".to_string())?;
    } else {
        tx.execute(
            "INSERT INTO prescription_drafts(
               local_id, patient_server_id, encounter_server_id, local_status, prescription_type,
               valid_until, regulatory_data, payload, updated_at
             ) VALUES (?1, ?2, ?3, 'PENDING_SYNC', ?4, ?5, ?6, ?7, ?8)",
            params![
                local_id,
                input.patient_id,
                input.encounter_id,
                input.prescription_type,
                input.valid_until,
                input.regulatory.as_ref().map(Value::to_string),
                payload.to_string(),
                occurred_at,
            ],
        )
        .map_err(|_| "Brouillon d’ordonnance non enregistré.".to_string())?;
    }
    replace_prescription_items(&tx, &local_id, &input.items)?;

    let mutable_operation: Option<String> = tx
        .query_row(
            "SELECT operation_id FROM sync_outbox
             WHERE entity_type='PRESCRIPTION' AND local_entity_id=?1 AND operation=?2
               AND status IN ('PENDING','RETRYABLE') AND attempt_count=0 ORDER BY sequence LIMIT 1",
            params![local_id, operation],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "Outbox ordonnance illisible.".to_string())?;
    let attempted_operation: Option<String> = if mutable_operation.is_none() {
        tx.query_row(
            "SELECT operation_id FROM sync_outbox
             WHERE entity_type='PRESCRIPTION' AND local_entity_id=?1
               AND status IN ('PENDING','RETRYABLE') AND attempt_count>0 ORDER BY sequence LIMIT 1",
            params![local_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "Outbox ordonnance illisible.".to_string())?
    } else {
        None
    };
    let operation_id = mutable_operation
        .clone()
        .or_else(|| attempted_operation.clone())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    if attempted_operation.is_none() {
        let envelope = json!({
            "operationId": operation_id,
            "entityType": "PRESCRIPTION",
            "localEntityId": local_id,
            "operation": operation,
            "baseVersion": base_version,
            "occurredAt": occurred_at,
            "payload": payload,
        });
        let sequence: i64 = tx
            .query_row(
                "SELECT COALESCE(MAX(sequence), 0) + 1 FROM sync_outbox",
                [],
                |row| row.get(0),
            )
            .map_err(|_| "Séquence outbox indisponible.".to_string())?;
        tx.execute(
        "INSERT INTO sync_outbox(operation_id, device_id, entity_type, local_entity_id, operation, base_version, payload, occurred_at, sequence, status, attempt_count)
         VALUES (?1, ?2, 'PRESCRIPTION', ?3, ?4, ?5, ?6, ?7, ?8, 'PENDING', 0)
         ON CONFLICT(operation_id) DO UPDATE SET base_version=excluded.base_version,
           payload=excluded.payload, occurred_at=excluded.occurred_at, status='PENDING'",
        params![operation_id, claims.device_id, local_id, operation, base_version, envelope.to_string(), occurred_at, sequence],
    )
    .map_err(|_| "Outbox ordonnance non enregistrée.".to_string())?;
    }
    tx.execute(
        "INSERT INTO local_audit_events(id, action, entity_type, entity_id, actor_id, device_id, occurred_at)
         VALUES (?1, 'PRESCRIPTION_SAVED_OFFLINE', 'PRESCRIPTION', ?2, ?3, ?4, ?5)",
        params![Uuid::new_v4().to_string(), local_id, claims.user_id, claims.device_id, occurred_at],
    )
    .map_err(|_| "Audit ordonnance non enregistré.".to_string())?;
    tx.commit()
        .map_err(|_| "Brouillon d’ordonnance non validé.".to_string())?;
    Ok(SavedDraft {
        local_id,
        operation_id,
    })
}

fn prescription_row_value(
    connection: &Connection,
    local_id: String,
    server_id: Option<String>,
    patient_id: String,
    server_status: Option<String>,
    local_status: String,
    base_version: Option<i64>,
    prescription_type: String,
    valid_until: Option<String>,
    number: Option<String>,
    updated_at: String,
) -> Result<Value, String> {
    let mut statement = connection
        .prepare("SELECT payload FROM prescription_items WHERE prescription_local_id=?1 ORDER BY position")
        .map_err(|_| "Items d’ordonnance indisponibles.".to_string())?;
    let items = statement
        .query_map(params![local_id], |row| row.get::<_, String>(0))
        .map_err(|_| "Items d’ordonnance illisibles.".to_string())?
        .map(|row| {
            let payload = row.map_err(|_| "Item d’ordonnance illisible.".to_string())?;
            serde_json::from_str::<Value>(&payload)
                .map_err(|_| "Item d’ordonnance corrompu.".to_string())
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(json!({
        "localId": local_id,
        "serverId": server_id,
        "patientId": patient_id,
        "serverStatus": server_status,
        "localStatus": local_status,
        "baseVersion": base_version,
        "type": prescription_type,
        "validUntil": valid_until,
        "items": items,
        "number": number,
        "updatedAt": updated_at,
    }))
}

pub fn list_patient_prescriptions(app: &EngineEnv, patient_id: &str) -> Result<Vec<Value>, String> {
    let connection = open(app)?;
    let mut statement = connection
        .prepare(
            "SELECT local_id, server_id, patient_server_id, server_status, local_status,
                    base_version, prescription_type, valid_until, number, updated_at
             FROM prescription_drafts WHERE patient_server_id=?1 ORDER BY updated_at DESC",
        )
        .map_err(|_| "Ordonnances locales indisponibles.".to_string())?;
    let rows = statement
        .query_map(params![patient_id], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
                row.get(7)?,
                row.get(8)?,
                row.get(9)?,
            ))
        })
        .map_err(|_| "Ordonnances locales illisibles.".to_string())?
        .collect::<Result<
            Vec<(
                String,
                Option<String>,
                String,
                Option<String>,
                String,
                Option<i64>,
                String,
                Option<String>,
                Option<String>,
                String,
            )>,
            _,
        >>()
        .map_err(|_| "Ordonnance locale illisible.".to_string())?;
    drop(statement);
    rows.into_iter()
        .map(|row| {
            prescription_row_value(
                &connection,
                row.0,
                row.1,
                row.2,
                row.3,
                row.4,
                row.5,
                row.6,
                row.7,
                row.8,
                row.9,
            )
        })
        .collect()
}

pub fn get_local_prescription(app: &EngineEnv, local_id: &str) -> Result<Value, String> {
    let connection = open(app)?;
    let row = connection
        .query_row(
            "SELECT local_id, server_id, patient_server_id, server_status, local_status,
                    base_version, prescription_type, valid_until, number, updated_at
             FROM prescription_drafts WHERE local_id=?1",
            params![local_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                    row.get(8)?,
                    row.get(9)?,
                ))
            },
        )
        .optional()
        .map_err(|_| "Ordonnance locale illisible.".to_string())?
        .ok_or_else(|| "Ordonnance locale introuvable.".to_string())?;
    prescription_row_value(
        &connection,
        row.0,
        row.1,
        row.2,
        row.3,
        row.4,
        row.5,
        row.6,
        row.7,
        row.8,
        row.9,
    )
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub state: String,
    pub pending_count: i64,
    pub conflict_count: i64,
    #[serde(default)]
    pub locked_count: i64,
    pub last_synced_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub processed: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<i64>,
}

pub fn sync_status(app: &EngineEnv) -> Result<SyncStatus, String> {
    let connection = open(app)?;
    let pending_count = connection
        .query_row(
            "SELECT COUNT(*) FROM sync_outbox WHERE status IN ('PENDING','RETRYABLE')",
            [],
            |row| row.get(0),
        )
        .map_err(|_| "État outbox indisponible.".to_string())?;
    let conflict_count = connection
        .query_row(
            "SELECT COUNT(*) FROM sync_conflicts WHERE status='OPEN'",
            [],
            |row| row.get(0),
        )
        .map_err(|_| "État des conflits indisponible.".to_string())?;
    let locked_count = connection
        .query_row("SELECT COUNT(*) FROM patients WHERE locked=1", [], |row| {
            row.get(0)
        })
        .map_err(|_| "État des dossiers verrouillés indisponible.".to_string())?;
    let last_synced_at = connection
        .query_row(
            "SELECT last_synced_at FROM sync_state WHERE id=1",
            [],
            |row| row.get(0),
        )
        .map_err(|_| "État sync indisponible.".to_string())?;
    // Locked folders mean the Server tightened the scope: the UI must show
    // the explicit state instead of a generic online/offline pair.
    let state = if conflict_count > 0 {
        "CONFLICT"
    } else if locked_count > 0 {
        "SCOPE_REVOKED"
    } else {
        "ONLINE"
    };
    Ok(SyncStatus {
        state: state.to_string(),
        pending_count,
        conflict_count,
        locked_count,
        last_synced_at,
        processed: None,
        total: None,
    })
}

pub fn pending_operations(app: &EngineEnv) -> Result<Vec<Value>, String> {
    let mut connection = open(app)?;
    pending_operations_on_connection(&mut connection)
}

// Selection and attempt marking are one local transaction. Once returned to
// network.rs, the exact stored envelope is immutable even across a crash.
fn pending_operations_on_connection(connection: &mut Connection) -> Result<Vec<Value>, String> {
    let mut statement = connection
        .prepare("SELECT operation_id, payload FROM sync_outbox WHERE status IN ('PENDING','RETRYABLE') ORDER BY sequence LIMIT 50")
        .map_err(|_| "Outbox locale indisponible.".to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|_| "Outbox locale illisible.".to_string())?;
    let selected: Vec<(String, String)> = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Opération locale illisible.".to_string())?;
    drop(statement);
    if selected.is_empty() {
        return Ok(Vec::new());
    }
    let attempted_at = now_iso(connection)?;
    let tx = connection
        .transaction()
        .map_err(|_| "Transaction d’envoi locale impossible.".to_string())?;
    for (operation_id, _) in &selected {
        tx.execute(
            "UPDATE sync_outbox SET attempt_count=attempt_count+1,
             first_attempted_at=COALESCE(first_attempted_at, ?2), last_attempted_at=?2
             WHERE operation_id=?1",
            params![operation_id, attempted_at],
        )
        .map_err(|_| "Tentative de synchronisation non enregistrée.".to_string())?;
    }
    tx.commit()
        .map_err(|_| "Tentative de synchronisation non validée.".to_string())?;
    selected
        .into_iter()
        .map(|(_, payload)| {
            serde_json::from_str(&payload).map_err(|_| "Opération locale corrompue.".to_string())
        })
        .collect()
}

pub fn current_cursor(app: &EngineEnv) -> Result<String, String> {
    open(app)?
        .query_row("SELECT cursor FROM sync_state WHERE id=1", [], |row| {
            row.get(0)
        })
        .map_err(|_| "Curseur local indisponible.".to_string())
}

fn has_local_changes_after_attempt(
    tx: &Transaction<'_>,
    operation_id: &str,
    entity_type: &str,
    local_id: &str,
) -> Result<bool, String> {
    let envelope: String = tx
        .query_row(
            "SELECT payload FROM sync_outbox WHERE operation_id=?1",
            params![operation_id],
            |row| row.get(0),
        )
        .map_err(|_| "Opération acquittée introuvable.".to_string())?;
    let sent: Value = serde_json::from_str(&envelope)
        .map_err(|_| "Opération acquittée illisible.".to_string())?;
    let sent_payload = sent
        .get("payload")
        .ok_or_else(|| "Payload acquitté absent.".to_string())?;
    let local_payload: String = match entity_type {
        "CONSULTATION" => tx.query_row(
            "SELECT payload FROM consultations WHERE local_id=?1",
            params![local_id],
            |row| row.get(0),
        ),
        "PRESCRIPTION" => tx.query_row(
            "SELECT payload FROM prescription_drafts WHERE local_id=?1",
            params![local_id],
            |row| row.get(0),
        ),
        _ => return Ok(false),
    }
    .map_err(|_| "Donnée locale acquittée introuvable.".to_string())?;
    let local: Value = serde_json::from_str(&local_payload)
        .map_err(|_| "Donnée locale acquittée illisible.".to_string())?;
    Ok(&local != sent_payload)
}

fn queue_follow_up_after_ack(
    tx: &Transaction<'_>,
    operation_id: &str,
    entity_type: &str,
    local_id: &str,
    server_id: &str,
    base_version: i64,
    occurred_at: &str,
) -> Result<(), String> {
    let (device_id, local_payload): (String, String) = tx
        .query_row(
            "SELECT o.device_id, CASE WHEN ?2='CONSULTATION' THEN c.payload ELSE p.payload END
             FROM sync_outbox o
             LEFT JOIN consultations c ON c.local_id=?3
             LEFT JOIN prescription_drafts p ON p.local_id=?3
             WHERE o.operation_id=?1",
            params![operation_id, entity_type, local_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "Nouvelle opération locale impossible.".to_string())?;
    let payload: Value =
        serde_json::from_str(&local_payload).map_err(|_| "Payload local illisible.".to_string())?;
    let next_id = Uuid::new_v4().to_string();
    let sequence: i64 = tx
        .query_row(
            "SELECT COALESCE(MAX(sequence), 0) + 1 FROM sync_outbox",
            [],
            |row| row.get(0),
        )
        .map_err(|_| "Séquence outbox indisponible.".to_string())?;
    let envelope = json!({
        "operationId": next_id,
        "entityType": entity_type,
        "localEntityId": local_id,
        "operation": "UPDATE",
        "baseVersion": base_version,
        "occurredAt": occurred_at,
        "payload": payload,
    });
    tx.execute(
        "INSERT INTO sync_outbox(operation_id, device_id, entity_type, local_entity_id, operation, base_version, payload, occurred_at, sequence, status, attempt_count)
         VALUES (?1, ?2, ?3, ?4, 'UPDATE', ?5, ?6, ?7, ?8, 'PENDING', 0)",
        params![next_id, device_id, entity_type, local_id, base_version, envelope.to_string(), occurred_at, sequence],
    )
    .map_err(|_| "Suite de synchronisation non enregistrée.".to_string())?;
    // The payload has now been captured in a fresh immutable envelope.
    if entity_type == "CONSULTATION" {
        tx.execute(
            "UPDATE consultations SET local_status='LOCAL_DRAFT' WHERE local_id=?1",
            params![local_id],
        )
        .map_err(|_| "État consultation non actualisé.".to_string())?;
    } else if entity_type == "PRESCRIPTION" {
        tx.execute(
            "UPDATE prescription_drafts SET local_status='PENDING_SYNC' WHERE local_id=?1",
            params![local_id],
        )
        .map_err(|_| "État ordonnance non actualisé.".to_string())?;
    }
    let _ = server_id; // The mapping was committed by the caller in this transaction.
    Ok(())
}

pub fn apply_push_results(app: &EngineEnv, results: &[Value]) -> Result<(), String> {
    let mut connection = open(app)?;
    apply_push_results_on_connection(&mut connection, results)
}

fn apply_push_results_on_connection(
    connection: &mut Connection,
    results: &[Value],
) -> Result<(), String> {
    let detected_at = now_iso(connection)?;
    // IMMEDIATE: the "already applied?" check below and the writes that follow
    // are one atomic step, even against another connection on the database.
    let tx = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|_| "Transaction locale impossible.".to_string())?;
    for result in results {
        let operation_id = string(result, "operationId")?;
        let status = string(result, "status")?;
        // A result already applied to this operation (the same ACK processed
        // twice) changes nothing: re-running it would queue a second
        // follow-up UPDATE or record the same conflict again.
        let settled: Option<String> = tx
            .query_row(
                "SELECT status FROM sync_outbox WHERE operation_id=?1",
                params![operation_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|_| "Outbox locale illisible.".to_string())?;
        if matches!(settled.as_deref(), Some("ACK" | "CONFLICT" | "REJECTED")) {
            continue;
        }
        let entity_type = result
            .get("entityType")
            .and_then(Value::as_str)
            .unwrap_or("CONSULTATION");
        match status.as_str() {
            "ACK" => {
                let local_id = string(result, "localEntityId")?;
                let server_id = string(result, "serverEntityId")?;
                let version = result
                    .get("serverVersion")
                    .and_then(Value::as_i64)
                    .unwrap_or(1);
                let dirty_after_attempt =
                    has_local_changes_after_attempt(&tx, &operation_id, &entity_type, &local_id)?;
                tx.execute(
                    "UPDATE sync_outbox SET status='ACK' WHERE operation_id=?1",
                    params![operation_id],
                )
                .map_err(|_| "ACK local impossible.".to_string())?;
                tx.execute(
                    "UPDATE consultations SET server_id=?1, base_version=?2,
                     local_status=CASE WHEN ?3 THEN local_status ELSE 'SYNCED' END,
                     last_synced_at=?4 WHERE local_id=?5 AND ?6='CONSULTATION'",
                    params![
                        server_id,
                        version,
                        dirty_after_attempt as i64,
                        detected_at,
                        local_id,
                        entity_type
                    ],
                )
                .map_err(|_| "Consultation locale non acquittée.".to_string())?;
                tx.execute(
                    "INSERT OR REPLACE INTO sync_entity_map(entity_type, local_entity_id, server_entity_id) SELECT 'CONSULTATION', ?1, ?2 WHERE ?3='CONSULTATION'",
                    params![local_id, server_id, entity_type],
                ).map_err(|_| "Mapping local non enregistré.".to_string())?;
                tx.execute(
                    "UPDATE prescription_drafts SET server_id=?1, base_version=?2, server_status='DRAFT',
                     local_status=CASE WHEN ?3 THEN local_status ELSE 'SYNCED' END,
                     last_synced_at=?4 WHERE local_id=?5 AND ?6='PRESCRIPTION'",
                    params![server_id, version, dirty_after_attempt as i64, detected_at, local_id, entity_type],
                ).map_err(|_| "Ordonnance locale non acquittée.".to_string())?;
                tx.execute(
                    "INSERT OR REPLACE INTO sync_entity_map(entity_type, local_entity_id, server_entity_id) SELECT 'PRESCRIPTION', ?1, ?2 WHERE ?3='PRESCRIPTION'",
                    params![local_id, server_id, entity_type],
                ).map_err(|_| "Mapping ordonnance non enregistré.".to_string())?;
                tx.execute("UPDATE local_audit_events SET synced_at=?1 WHERE entity_id=?2 AND synced_at IS NULL", params![detected_at, local_id])
                    .map_err(|_| "Audit local non acquitté.".to_string())?;
                if dirty_after_attempt {
                    queue_follow_up_after_ack(
                        &tx,
                        &operation_id,
                        &entity_type,
                        &local_id,
                        &server_id,
                        version,
                        &detected_at,
                    )?;
                }
            }
            "CONFLICT" => {
                let local_id = string(result, "localEntityId")?;
                tx.execute(
                    "UPDATE sync_outbox SET status='CONFLICT' WHERE operation_id=?1",
                    params![operation_id],
                )
                .map_err(|_| "Conflit outbox non enregistré.".to_string())?;
                tx.execute(
                    "INSERT INTO sync_conflicts(id, entity_type, entity_id, local_version, server_version, local_payload, server_payload, detected_at, status)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'OPEN')",
                    params![Uuid::new_v4().to_string(), entity_type, local_id, result.get("localVersion").and_then(Value::as_i64), result.get("serverVersion").and_then(Value::as_i64), result.get("localPayload").unwrap_or(&Value::Null).to_string(), result.get("serverPayload").unwrap_or(&Value::Null).to_string(), detected_at],
                ).map_err(|_| "Conflit local non enregistré.".to_string())?;
                if entity_type == "PRESCRIPTION" {
                    if result.get("code").and_then(Value::as_str)
                        == Some("PRESCRIPTION_NOT_EDITABLE")
                    {
                        if let Some(server_payload) = result.get("serverPayload") {
                            apply_server_prescription(&tx, server_payload, &detected_at, false)?;
                        } else {
                            tx.execute("UPDATE prescription_drafts SET local_status='READ_ONLY' WHERE local_id=?1", params![local_id])
                                .map_err(|_| "Ordonnance verrouillée non enregistrée.".to_string())?;
                        }
                    } else {
                        tx.execute("UPDATE prescription_drafts SET local_status='CONFLICT' WHERE local_id=?1", params![local_id])
                            .map_err(|_| "Conflit ordonnance non enregistré.".to_string())?;
                    }
                }
            }
            "REJECTED" => {
                tx.execute(
                    "UPDATE sync_outbox SET status='REJECTED' WHERE operation_id=?1",
                    params![operation_id],
                )
                .map_err(|_| "Rejet local non enregistré.".to_string())?;
                if entity_type == "PRESCRIPTION" {
                    let local_id = string(result, "localEntityId")?;
                    tx.execute(
                        "UPDATE prescription_drafts SET local_status='CONFLICT' WHERE local_id=?1",
                        params![local_id],
                    )
                    .map_err(|_| "Rejet ordonnance non enregistré.".to_string())?;
                } else if result.get("code").and_then(Value::as_str)
                    == Some("OPERATION_ID_PAYLOAD_MISMATCH")
                {
                    // Never mint a replacement operation automatically after an
                    // integrity mismatch; preserve the local record for review.
                    let local_id = string(result, "localEntityId")?;
                    tx.execute(
                        "UPDATE consultations SET local_status='CONFLICT' WHERE local_id=?1",
                        params![local_id],
                    )
                    .map_err(|_| "Incohérence consultation non enregistrée.".to_string())?;
                }
            }
            "RETRYABLE" => {
                tx.execute("UPDATE sync_outbox SET status='RETRYABLE', retry_count=retry_count+1 WHERE operation_id=?1", params![operation_id])
                    .map_err(|_| "Retry local non enregistré.".to_string())?;
            }
            _ => return Err("Résultat de synchronisation inconnu.".to_string()),
        }
    }
    tx.commit()
        .map_err(|_| "Résultats push non validés.".to_string())
}

pub fn apply_pull(app: &EngineEnv, response: &Value) -> Result<String, String> {
    let mut connection = open(app)?;
    let synced_at = string(response, "serverTime")?;
    let tx = connection
        .transaction()
        .map_err(|_| "Transaction locale impossible.".to_string())?;
    for change in response
        .get("changes")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let entity_type = string(change, "entityType")?;
        let operation = string(change, "operation")?;
        if entity_type == "CONSULTATION" {
            if operation == "TOMBSTONE" {
                let server_id = string(change, "entityId")?;
                tx.execute(
                    "DELETE FROM consultations WHERE server_id=?1",
                    params![server_id],
                )
                .map_err(|_| "Tombstone local non appliqué.".to_string())?;
                continue;
            }
            let payload = change
                .get("payload")
                .ok_or_else(|| "Payload pull absent.".to_string())?;
            apply_server_consultation(&tx, payload, &synced_at, true)?;
        } else if entity_type == "PRESCRIPTION" {
            if operation == "TOMBSTONE" {
                apply_prescription_tombstone(&tx, change, &synced_at)?;
                continue;
            }
            let payload = change
                .get("payload")
                .ok_or_else(|| "Payload pull absent.".to_string())?;
            apply_server_prescription(&tx, payload, &synced_at, true)?;
        } else if entity_type == "PATIENT" {
            let patient_id = string(change, "entityId")?;
            if operation == "TOMBSTONE" {
                // The patient disappeared globally. Unsent local data blocks
                // a silent destruction: the folder is locked instead, the
                // rest is purged with everything that hangs on it.
                let (pending, conflicted) = patient_unsent_state(&tx, &patient_id)
                    .map_err(|_| "État local du patient illisible.".to_string())?;
                match crate::protocol::decide_removal(pending, conflicted) {
                    crate::protocol::ScopeRemoval::Purge => {
                        purge_patient(&tx, &patient_id)
                            .map_err(|_| "Patient supprimé non purgé localement.".to_string())?;
                    }
                    crate::protocol::ScopeRemoval::Lock => {
                        lock_patient(
                            &tx,
                            &patient_id,
                            crate::protocol::PATIENT_DELETED_LOCK_REASON,
                        )
                        .map_err(|_| "Patient verrouillé localement impossible.".to_string())?;
                    }
                }
                continue;
            }
            let payload = change
                .get("payload")
                .ok_or_else(|| "Payload pull absent.".to_string())?;
            apply_server_patient(&tx, payload, &synced_at)?;
        } else if entity_type == "APPOINTMENT" {
            let server_id = string(change, "entityId")?;
            if operation == "TOMBSTONE" {
                tx.execute(
                    "DELETE FROM appointments_cache WHERE server_id=?1",
                    params![server_id],
                )
                .map_err(|_| "Rendez-vous tombstone non appliqué.".to_string())?;
                continue;
            }
            let payload = change
                .get("payload")
                .ok_or_else(|| "Payload pull absent.".to_string())?;
            tx.execute(
                "INSERT OR REPLACE INTO appointments_cache(server_id, patient_server_id, payload, server_updated_at, last_synced_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![server_id, string(payload, "patientId")?, payload.to_string(), string(payload, "updatedAt")?, synced_at],
            )
            .map_err(|_| "Rendez-vous local non enregistré.".to_string())?;
        }
        // Other entity types are ignored — the desktop V1 understands
        // exactly the three above.
    }
    let cursor = string(response, "nextCursor")?;
    tx.execute(
        "UPDATE sync_state SET cursor=?1, last_synced_at=?2 WHERE id=1",
        params![cursor, synced_at],
    )
    .map_err(|_| "Curseur pull non enregistré.".to_string())?;
    tx.commit()
        .map_err(|_| "Pull local non validé.".to_string())?;
    Ok(cursor)
}

// Cloud -> desktop read-only upsert of the patient cache (same shape as the
// bootstrap rows).
fn apply_server_patient(
    tx: &Transaction<'_>,
    patient: &Value,
    synced_at: &str,
) -> Result<(), String> {
    let id = string(patient, "id")?;
    let search_text = format!(
        "{} {} {} {} {}",
        patient
            .get("firstName")
            .and_then(Value::as_str)
            .unwrap_or(""),
        patient
            .get("lastName")
            .and_then(Value::as_str)
            .unwrap_or(""),
        patient
            .get("firstNameAr")
            .and_then(Value::as_str)
            .unwrap_or(""),
        patient
            .get("lastNameAr")
            .and_then(Value::as_str)
            .unwrap_or(""),
        patient
            .get("hospitalRecordNumber")
            .and_then(Value::as_str)
            .unwrap_or("")
    )
    .to_lowercase();
    let workspace_id: String = tx
        .query_row("SELECT id FROM local_workspace LIMIT 1", [], |row| {
            row.get(0)
        })
        .map_err(|_| "Workspace local absent.".to_string())?;
    tx.execute(
        "INSERT INTO patients(server_id, workspace_id, search_text, payload, server_updated_at, last_synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(server_id) DO UPDATE SET search_text=excluded.search_text, payload=excluded.payload,
         server_updated_at=excluded.server_updated_at, last_synced_at=excluded.last_synced_at",
        params![id, workspace_id, search_text, patient.to_string(), string(patient, "updatedAt")?, synced_at],
    )
    .map_err(|_| "Patient local non enregistré.".to_string())?;
    tx.execute(
        "INSERT OR REPLACE INTO patient_medical_summaries(patient_server_id, payload, server_updated_at, last_synced_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![id, patient.get("medicalSummary").unwrap_or(&Value::Null).to_string(), string(patient, "updatedAt")?, synced_at],
    )
    .map_err(|_| "Résumé médical local non enregistré.".to_string())?;
    // A patient back in scope opens again.
    tx.execute(
        "UPDATE patients SET locked=0, lock_reason=NULL WHERE server_id=?1",
        params![id],
    )
    .map_err(|_| "Patient local non déverrouillé.".to_string())?;
    Ok(())
}

// A pulled change whose version this device already holds is an echo, not a
// divergence: its own write (acknowledged, possibly replayed after a lost
// ACK) or an older state. Unsent local work stacked on top of that version
// stays untouched and raises no conflict; only a strictly newer server
// version differs from the base that work started from.
fn is_known_server_version(
    table: &str,
    tx: &Transaction<'_>,
    local_id: &str,
    payload: &Value,
) -> Result<bool, String> {
    let Some(incoming) = payload.get("syncVersion").and_then(Value::as_i64) else {
        return Ok(false);
    };
    let known: Option<Option<i64>> = tx
        .query_row(
            &format!("SELECT base_version FROM {table} WHERE local_id=?1"),
            params![local_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "Version locale illisible.".to_string())?;
    Ok(known.flatten().is_some_and(|known| incoming <= known))
}

fn apply_server_consultation(
    tx: &Transaction<'_>,
    payload: &Value,
    synced_at: &str,
    detect_pending: bool,
) -> Result<(), String> {
    let server_id = string(payload, "id")?;
    let existing: Option<String> = tx
        .query_row(
            "SELECT local_id FROM consultations WHERE server_id=?1",
            params![server_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "Consultation locale illisible.".to_string())?;
    let local_id = existing.unwrap_or_else(|| Uuid::new_v4().to_string());
    if detect_pending {
        let pending: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM sync_outbox WHERE local_entity_id=?1 AND status IN ('PENDING','RETRYABLE'))",
            params![local_id], |row| row.get(0),
        ).map_err(|_| "Outbox consultation illisible.".to_string())?;
        if pending {
            if is_known_server_version("consultations", tx, &local_id, payload)? {
                return Ok(());
            }
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

fn replace_server_prescription_items(
    tx: &Transaction<'_>,
    local_id: &str,
    items: &[Value],
) -> Result<(), String> {
    tx.execute(
        "DELETE FROM prescription_items WHERE prescription_local_id=?1",
        params![local_id],
    )
    .map_err(|_| "Items serveur non actualisés.".to_string())?;
    for (position, item) in items.iter().enumerate() {
        tx.execute(
            "INSERT INTO prescription_items(id, prescription_local_id, position, payload)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                Uuid::new_v4().to_string(),
                local_id,
                position as i64,
                item.to_string()
            ],
        )
        .map_err(|_| "Item serveur non enregistré.".to_string())?;
    }
    Ok(())
}

fn apply_server_prescription(
    tx: &Transaction<'_>,
    payload: &Value,
    synced_at: &str,
    detect_pending: bool,
) -> Result<(), String> {
    let server_id = string(payload, "id")?;
    let existing: Option<String> = tx
        .query_row(
            "SELECT local_id FROM prescription_drafts WHERE server_id=?1",
            params![server_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "Ordonnance locale illisible.".to_string())?;
    let local_id = existing
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let server_status = string(payload, "status")?;
    let has_pending: bool = if detect_pending {
        tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM sync_outbox WHERE entity_type='PRESCRIPTION'
             AND local_entity_id=?1 AND status IN ('PENDING','RETRYABLE'))",
            params![local_id],
            |row| row.get(0),
        )
        .map_err(|_| "Outbox ordonnance illisible.".to_string())?
    } else {
        false
    };
    if has_pending {
        if is_known_server_version("prescription_drafts", tx, &local_id, payload)? {
            return Ok(());
        }
        tx.execute(
            "INSERT INTO sync_conflicts(id, entity_type, entity_id, local_version, server_version,
             local_payload, server_payload, detected_at, status)
             SELECT ?1, 'PRESCRIPTION', local_id, base_version, ?2, payload, ?3, ?4, 'OPEN'
             FROM prescription_drafts WHERE local_id=?5",
            params![
                Uuid::new_v4().to_string(),
                payload.get("syncVersion").and_then(Value::as_i64),
                payload.to_string(),
                synced_at,
                local_id
            ],
        )
        .map_err(|_| "Conflit ordonnance pull non enregistré.".to_string())?;
        tx.execute(
            "UPDATE sync_outbox SET status='CONFLICT' WHERE entity_type='PRESCRIPTION'
             AND local_entity_id=?1 AND status IN ('PENDING','RETRYABLE')",
            params![local_id],
        )
        .map_err(|_| "Outbox ordonnance conflictuelle non enregistrée.".to_string())?;
        if server_status == "DRAFT" {
            tx.execute(
                "UPDATE prescription_drafts SET local_status='CONFLICT' WHERE local_id=?1",
                params![local_id],
            )
            .map_err(|_| "Conflit ordonnance non enregistré.".to_string())?;
            return Ok(());
        }
        // A terminal server state wins for editability. The local payload is
        // already stored in sync_conflicts above for diagnosis.
    }
    let local_status = if server_status == "DRAFT" {
        if !detect_pending || existing.is_some() {
            "SYNCED"
        } else {
            "READ_ONLY"
        }
    } else {
        "READ_ONLY"
    };
    let items = payload
        .get("items")
        .and_then(Value::as_array)
        .ok_or_else(|| "Items ordonnance serveur absents.".to_string())?;
    tx.execute(
        "INSERT INTO prescription_drafts(
           local_id, server_id, patient_server_id, encounter_server_id, local_status, server_status,
           base_version, prescription_type, valid_until, regulatory_data, number, payload,
           server_updated_at, last_synced_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?13)
         ON CONFLICT(local_id) DO UPDATE SET server_id=excluded.server_id,
           patient_server_id=excluded.patient_server_id, encounter_server_id=excluded.encounter_server_id,
           local_status=excluded.local_status, server_status=excluded.server_status,
           base_version=excluded.base_version, prescription_type=excluded.prescription_type,
           valid_until=excluded.valid_until, regulatory_data=excluded.regulatory_data, number=excluded.number,
           payload=excluded.payload, server_updated_at=excluded.server_updated_at,
           last_synced_at=excluded.last_synced_at, updated_at=excluded.updated_at",
        params![
            local_id,
            server_id,
            string(payload, "patientId")?,
            payload.get("encounterId").and_then(Value::as_str),
            local_status,
            server_status,
            payload.get("syncVersion").and_then(Value::as_i64).unwrap_or(1),
            string(payload, "type")?,
            payload.get("validUntil").and_then(Value::as_str),
            payload.get("regulatoryData").map(Value::to_string),
            payload.get("number").and_then(Value::as_str),
            payload.to_string(),
            string(payload, "updatedAt")?,
            synced_at,
        ],
    )
    .map_err(|_| "Ordonnance serveur non appliquée.".to_string())?;
    replace_server_prescription_items(tx, &local_id, items)?;
    tx.execute(
        "INSERT OR REPLACE INTO sync_entity_map(entity_type, local_entity_id, server_entity_id)
         VALUES ('PRESCRIPTION', ?1, ?2)",
        params![local_id, server_id],
    )
    .map_err(|_| "Mapping ordonnance non appliqué.".to_string())?;
    Ok(())
}

fn apply_prescription_tombstone(
    tx: &Transaction<'_>,
    change: &Value,
    detected_at: &str,
) -> Result<(), String> {
    let server_id = string(change, "entityId")?;
    let existing: Option<String> = tx
        .query_row(
            "SELECT local_id FROM prescription_drafts WHERE server_id=?1",
            params![server_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| "Ordonnance tombstone illisible.".to_string())?;
    let Some(local_id) = existing else {
        return Ok(());
    };
    let pending: bool = tx
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sync_outbox WHERE entity_type='PRESCRIPTION'
         AND local_entity_id=?1 AND status IN ('PENDING','RETRYABLE'))",
            params![local_id],
            |row| row.get(0),
        )
        .map_err(|_| "Outbox ordonnance illisible.".to_string())?;
    let conflicted: bool = tx
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sync_conflicts WHERE entity_type='PRESCRIPTION'
         AND entity_id=?1 AND status='OPEN')",
            params![local_id],
            |row| row.get(0),
        )
        .map_err(|_| "Conflit ordonnance illisible.".to_string())?;
    if pending || conflicted {
        tx.execute(
            "UPDATE sync_outbox SET status='CONFLICT' WHERE entity_type='PRESCRIPTION'
             AND local_entity_id=?1 AND status IN ('PENDING','RETRYABLE')",
            params![local_id],
        )
        .map_err(|_| "Outbox tombstone non enregistrée.".to_string())?;
        if !conflicted {
            tx.execute(
                "INSERT INTO sync_conflicts(id, entity_type, entity_id, local_version, server_version,
                 local_payload, server_payload, detected_at, status)
                 SELECT ?1, 'PRESCRIPTION', local_id, base_version, ?2, payload, ?3, ?4, 'OPEN'
                 FROM prescription_drafts WHERE local_id=?5",
                params![Uuid::new_v4().to_string(), change.get("payload").and_then(|v| v.get("syncVersion")).and_then(Value::as_i64), change.get("payload").unwrap_or(&Value::Null).to_string(), detected_at, local_id],
            )
            .map_err(|_| "Conflit tombstone non enregistré.".to_string())?;
        }
        tx.execute(
            "UPDATE prescription_drafts SET local_status='CONFLICT' WHERE local_id=?1",
            params![local_id],
        )
        .map_err(|_| "Ordonnance tombstone non verrouillée.".to_string())?;
        return Ok(());
    }
    tx.execute(
        "DELETE FROM sync_entity_map WHERE entity_type='PRESCRIPTION' AND local_entity_id=?1",
        params![local_id],
    )
    .map_err(|_| "Mapping tombstone non supprimé.".to_string())?;
    tx.execute(
        "DELETE FROM prescription_drafts WHERE local_id=?1",
        params![local_id],
    )
    .map_err(|_| "Ordonnance tombstone non supprimée.".to_string())?;
    Ok(())
}

// ---- Storage tests ---------------------------------------------------------
// The reconciliation helpers are exercised against an in-memory database
// seeded with the same schema: no keyring, no host, no network.
#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{
        decide_removal, ScopeRemoval, PATIENT_DELETED_LOCK_REASON, SCOPE_REVOKED_LOCK_REASON,
    };

    fn memory_db() -> Connection {
        let connection = Connection::open_in_memory().expect("sqlite memory");
        connection.execute_batch(SCHEMA).expect("schema");
        apply_local_migrations(&connection).expect("local migrations");
        connection
    }

    fn insert_patient(connection: &Connection, id: &str) {
        connection
            .execute(
                "INSERT INTO patients(server_id, workspace_id, search_text, payload, server_updated_at, last_synced_at)
                 VALUES (?1, 'ws-1', 'a', '{}', '2026-10-28T00:00:00Z', '2026-10-28T00:00:00Z')",
                params![id],
            )
            .expect("patient");
    }

    fn insert_consultation(connection: &Connection, local_id: &str, patient_id: &str) {
        connection
            .execute(
                "INSERT INTO consultations(local_id, patient_server_id, local_status, payload, updated_at)
                 VALUES (?1, ?2, 'SYNCED', '{}', '2026-10-28T00:00:00Z')",
                params![local_id, patient_id],
            )
            .expect("consultation");
    }

    fn insert_outbox(
        connection: &Connection,
        operation_id: &str,
        local_entity_id: &str,
        status: &str,
    ) {
        connection
            .execute(
                "INSERT INTO sync_outbox(operation_id, device_id, entity_type, local_entity_id, operation, payload, occurred_at, sequence, status)
                 VALUES (?1, 'device-1', 'CONSULTATION', ?2, 'UPDATE', '{}', '2026-10-28T00:00:00Z', 1, ?3)",
                params![operation_id, local_entity_id, status],
            )
            .expect("outbox");
    }

    fn test_claims() -> GrantClaims {
        GrantClaims {
            token_type: "offline-grant".to_string(),
            grant_id: "grant-1".to_string(),
            user_id: "user-1".to_string(),
            device_id: "device-1".to_string(),
            workspace_id: "ws-1".to_string(),
            role: "INDEPENDENT_DOCTOR".to_string(),
            exp: 9_999_999_999,
            iat: 1,
            iss: "healixdz-api".to_string(),
            aud: "healixdz-desktop".to_string(),
        }
    }

    fn prescription_input(patient_id: &str, local_id: Option<String>) -> PrescriptionDraftInput {
        PrescriptionDraftInput {
            local_id,
            patient_id: patient_id.to_string(),
            encounter_id: None,
            prescription_type: "STANDARD".to_string(),
            valid_until: None,
            regulatory: None,
            items: vec![PrescriptionItemInput {
                medication_id: Some("med-1".to_string()),
                dci: "Paracétamol".to_string(),
                brand_name: Some("Doliprane".to_string()),
                strength: "500 mg".to_string(),
                pharmaceutical_form: "TABLET".to_string(),
                route: "ORAL".to_string(),
                manufacturer: None,
                regulatory_category: "STANDARD".to_string(),
                dose_per_intake: "1 comprimé".to_string(),
                frequency: "3 fois par jour".to_string(),
                intake_moment: None,
                duration_days: Some(3),
                quantity: "1 boîte".to_string(),
                patient_instructions: None,
                indication: None,
                as_needed: false,
                renewal_allowed: false,
                substitution_allowed: false,
            }],
        }
    }

    fn server_prescription(id: &str, patient_id: &str, status: &str, version: i64) -> Value {
        json!({
            "id": id,
            "patientId": patient_id,
            "encounterId": null,
            "status": status,
            "type": "STANDARD",
            "syncVersion": version,
            "number": if status == "VALIDATED" { Value::String("ORD-2026-000001".to_string()) } else { Value::Null },
            "validUntil": null,
            "regulatoryData": null,
            "updatedAt": "2026-10-29T10:00:00.000Z",
            "items": [
                {"id":"server-item-1","position":0,"medicationId":"med-1","dci":"Paracétamol","brandName":"Doliprane","strength":"500 mg","pharmaceuticalForm":"TABLET","route":"ORAL","manufacturer":null,"regulatoryCategory":"STANDARD","dosePerIntake":"1 comprimé","frequency":"3 fois par jour","intakeMoment":null,"durationDays":3,"quantity":"1 boîte","patientInstructions":null,"indication":null,"asNeeded":false,"renewalAllowed":false,"substitutionAllowed":false}
            ]
        })
    }

    #[test]
    fn save_local_prescription_coalesces_create_and_ack_records_mapping() {
        let mut connection = memory_db();
        insert_patient(&connection, "patient-rx");
        let first = save_prescription_draft_on_connection(
            &mut connection,
            &test_claims(),
            prescription_input("patient-rx", None),
        )
        .expect("save create");
        let second = save_prescription_draft_on_connection(
            &mut connection,
            &test_claims(),
            prescription_input("patient-rx", Some(first.local_id.clone())),
        )
        .expect("coalesced save");
        assert_eq!(first.operation_id, second.operation_id);
        let operations: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sync_outbox WHERE entity_type='PRESCRIPTION'",
                [],
                |r| r.get(0),
            )
            .expect("outbox count");
        assert_eq!(operations, 1);
        apply_push_results_on_connection(
            &mut connection,
            &[json!({
                "operationId": first.operation_id,
                "entityType": "PRESCRIPTION",
                "localEntityId": first.local_id,
                "status": "ACK",
                "serverEntityId": "rx-server-1",
                "serverVersion": 1,
            })],
        )
        .expect("ack");
        let row: (String, i64, String) = connection
            .query_row(
                "SELECT server_id, base_version, local_status FROM prescription_drafts WHERE local_id=?1",
                params![second.local_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .expect("ack row");
        assert_eq!(row, ("rx-server-1".to_string(), 1, "SYNCED".to_string()));
    }

    #[test]
    fn attempted_prescription_create_is_immutable_and_lost_ack_queues_fresh_update() {
        let mut connection = memory_db();
        insert_patient(&connection, "patient-lost-ack-rx");
        let first = save_prescription_draft_on_connection(
            &mut connection,
            &test_claims(),
            prescription_input("patient-lost-ack-rx", None),
        )
        .expect("create A");
        let sent = pending_operations_on_connection(&mut connection).expect("mark attempted");
        assert_eq!(sent.len(), 1);

        let mut changed = prescription_input("patient-lost-ack-rx", Some(first.local_id.clone()));
        changed.items[0].quantity = "2 boîtes".to_string();
        let second =
            save_prescription_draft_on_connection(&mut connection, &test_claims(), changed)
                .expect("save B while ACK is lost");
        assert_eq!(first.operation_id, second.operation_id);
        let immutable: (String, i64) = connection
            .query_row(
                "SELECT payload, attempt_count FROM sync_outbox WHERE operation_id=?1",
                params![first.operation_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("immutable X");
        assert_eq!(immutable.1, 1);
        assert_eq!(
            serde_json::from_str::<Value>(&immutable.0).expect("envelope")["payload"]["items"][0]
                ["quantity"],
            "1 boîte"
        );

        apply_push_results_on_connection(
            &mut connection,
            &[json!({
                "operationId": first.operation_id,
                "entityType": "PRESCRIPTION",
                "localEntityId": first.local_id,
                "status": "ACK",
                "serverEntityId": "rx-lost-ack",
                "serverVersion": 1,
            })],
        )
        .expect("delayed ACK");
        let follow_up: (String, String, i64, String) = connection
            .query_row(
                "SELECT operation_id, operation, base_version, payload FROM sync_outbox
                 WHERE status='PENDING' ORDER BY sequence DESC LIMIT 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("follow-up Y");
        assert_ne!(follow_up.0, first.operation_id);
        assert_eq!(follow_up.1, "UPDATE");
        assert_eq!(follow_up.2, 1);
        assert_eq!(
            serde_json::from_str::<Value>(&follow_up.3).expect("Y")["payload"]["items"][0]
                ["quantity"],
            "2 boîtes"
        );
    }

    #[test]
    fn attempted_consultation_update_lost_ack_keeps_local_change_and_uses_ack_version() {
        let mut connection = memory_db();
        insert_patient(&connection, "patient-lost-ack-consultation");
        let local_id = "local-lost-ack-consultation";
        let sent_payload =
            json!({"patientId":"patient-lost-ack-consultation","chiefComplaint":"A"});
        let local_payload =
            json!({"patientId":"patient-lost-ack-consultation","chiefComplaint":"B"});
        connection.execute(
            "INSERT INTO consultations(local_id, server_id, patient_server_id, local_status, base_version, payload, updated_at)
             VALUES (?1, 'consultation-lost-ack', ?2, 'LOCAL_DRAFT', 4, ?3, '2026-10-30T00:00:00Z')",
            params![local_id, "patient-lost-ack-consultation", local_payload.to_string()],
        ).expect("local B");
        let x = Uuid::new_v4().to_string();
        let envelope = json!({"operationId":x.clone(),"entityType":"CONSULTATION","localEntityId":local_id,"operation":"UPDATE","baseVersion":4,"occurredAt":"2026-10-30T00:00:00Z","payload":sent_payload});
        connection.execute(
            "INSERT INTO sync_outbox(operation_id, device_id, entity_type, local_entity_id, operation, base_version, payload, occurred_at, sequence, status)
             VALUES (?1, 'device-1', 'CONSULTATION', ?2, 'UPDATE', 4, ?3, '2026-10-30T00:00:00Z', 1, 'PENDING')",
            params![x, local_id, envelope.to_string()],
        ).expect("X");
        pending_operations_on_connection(&mut connection).expect("attempt X");
        apply_push_results_on_connection(
            &mut connection,
            &[json!({
                "operationId": x.clone(), "entityType":"CONSULTATION", "localEntityId":local_id,
                "status":"ACK", "serverEntityId":"consultation-lost-ack", "serverVersion":5
            })],
        )
        .expect("delayed ACK");
        let y: (String, i64, String) = connection.query_row(
            "SELECT operation_id, base_version, payload FROM sync_outbox WHERE status='PENDING'",
            [], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).expect("Y");
        assert_ne!(x, y.0);
        assert_eq!(y.1, 5);
        assert_eq!(
            serde_json::from_str::<Value>(&y.2).expect("Y")["payload"]["chiefComplaint"],
            "B"
        );
    }

    fn server_consultation(id: &str, patient_id: &str, version: i64, complaint: &str) -> Value {
        json!({
            "id": id, "patientId": patient_id, "syncVersion": version,
            "chiefComplaint": complaint, "updatedAt": "2026-10-30T10:00:00.000Z"
        })
    }

    fn open_conflicts(connection: &Connection) -> i64 {
        connection
            .query_row(
                "SELECT COUNT(*) FROM sync_conflicts WHERE status='OPEN'",
                [],
                |r| r.get(0),
            )
            .expect("conflict count")
    }

    // The echo of an already-acknowledged write comes back in the next pull
    // while the follow-up UPDATE (carrying the newer local edit) is still
    // queued: it is not a divergence, and it must not freeze or overwrite B.
    #[test]
    fn pulled_echo_of_an_acknowledged_version_does_not_conflict_with_the_queued_follow_up() {
        let mut connection = memory_db();
        insert_patient(&connection, "patient-echo");
        let local_id = "local-echo-consultation";
        connection.execute(
            "INSERT INTO consultations(local_id, server_id, patient_server_id, local_status, base_version, payload, updated_at)
             VALUES (?1, 'consultation-echo', 'patient-echo', 'LOCAL_DRAFT', 2, '{\"chiefComplaint\":\"B\"}', '2026-10-30T00:00:00Z')",
            params![local_id],
        ).expect("local B on the ACK version");
        insert_outbox(&connection, "follow-up-y", local_id, "PENDING");

        let tx = connection.transaction().expect("tx");
        apply_server_consultation(
            &tx,
            &server_consultation("consultation-echo", "patient-echo", 2, "A"),
            "2026-10-30T10:00:01Z",
            true,
        )
        .expect("echo of the ACK version");
        tx.commit().expect("commit");

        assert_eq!(open_conflicts(&connection), 0);
        let local: (String, String) = connection
            .query_row(
                "SELECT payload, local_status FROM consultations WHERE local_id=?1",
                params![local_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .expect("local");
        assert_eq!(local.0, "{\"chiefComplaint\":\"B\"}");
        assert_eq!(local.1, "LOCAL_DRAFT");
        let status: String = connection
            .query_row(
                "SELECT status FROM sync_outbox WHERE operation_id='follow-up-y'",
                [],
                |r| r.get(0),
            )
            .expect("Y");
        assert_eq!(status, "PENDING");
    }

    #[test]
    fn pulled_echo_of_an_acknowledged_prescription_keeps_the_queued_follow_up() {
        let mut connection = memory_db();
        insert_patient(&connection, "patient-rx-echo");
        let first = save_prescription_draft_on_connection(
            &mut connection,
            &test_claims(),
            prescription_input("patient-rx-echo", None),
        )
        .expect("create A");
        pending_operations_on_connection(&mut connection).expect("attempt X");
        let mut changed = prescription_input("patient-rx-echo", Some(first.local_id.clone()));
        changed.items[0].quantity = "2 boîtes".to_string();
        save_prescription_draft_on_connection(&mut connection, &test_claims(), changed)
            .expect("B while the ACK is lost");
        apply_push_results_on_connection(
            &mut connection,
            &[json!({
                "operationId": first.operation_id, "entityType":"PRESCRIPTION",
                "localEntityId": first.local_id, "status":"ACK",
                "serverEntityId":"rx-echo", "serverVersion":1
            })],
        )
        .expect("replayed ACK");

        let tx = connection.transaction().expect("tx");
        apply_server_prescription(
            &tx,
            &server_prescription("rx-echo", "patient-rx-echo", "DRAFT", 1),
            "2026-10-30T10:00:01Z",
            true,
        )
        .expect("echo of the ACK version");
        tx.commit().expect("commit");

        assert_eq!(open_conflicts(&connection), 0);
        let pending: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sync_outbox WHERE status='PENDING' AND operation='UPDATE'",
                [],
                |r| r.get(0),
            )
            .expect("pending follow-up");
        assert_eq!(pending, 1);
        let state: String = connection
            .query_row(
                "SELECT local_status FROM prescription_drafts WHERE local_id=?1",
                params![first.local_id],
                |r| r.get(0),
            )
            .expect("state");
        assert_eq!(state, "PENDING_SYNC");
    }

    // The same ACK processed twice (two overlapping sessions, or a replay)
    // queues one follow-up, not two.
    #[test]
    fn the_same_ack_applied_twice_queues_a_single_follow_up() {
        let mut connection = memory_db();
        insert_patient(&connection, "patient-double-ack");
        let first = save_prescription_draft_on_connection(
            &mut connection,
            &test_claims(),
            prescription_input("patient-double-ack", None),
        )
        .expect("create A");
        pending_operations_on_connection(&mut connection).expect("attempt X");
        let mut changed = prescription_input("patient-double-ack", Some(first.local_id.clone()));
        changed.items[0].quantity = "2 boîtes".to_string();
        save_prescription_draft_on_connection(&mut connection, &test_claims(), changed)
            .expect("B while the ACK is lost");
        let ack = json!({
            "operationId": first.operation_id, "entityType":"PRESCRIPTION",
            "localEntityId": first.local_id, "status":"ACK",
            "serverEntityId":"rx-double-ack", "serverVersion":1
        });
        apply_push_results_on_connection(&mut connection, &[ack.clone()]).expect("first");
        apply_push_results_on_connection(&mut connection, &[ack]).expect("second");

        let follow_ups: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sync_outbox WHERE status='PENDING' AND operation='UPDATE'",
                [],
                |r| r.get(0),
            )
            .expect("follow-ups");
        assert_eq!(follow_ups, 1);
    }

    // A strictly newer server version is a real divergence: unchanged.
    #[test]
    fn pulled_newer_version_still_conflicts_with_unsent_local_work() {
        let mut connection = memory_db();
        insert_patient(&connection, "patient-newer");
        let local_id = "local-newer-consultation";
        connection.execute(
            "INSERT INTO consultations(local_id, server_id, patient_server_id, local_status, base_version, payload, updated_at)
             VALUES (?1, 'consultation-newer', 'patient-newer', 'LOCAL_DRAFT', 2, '{\"chiefComplaint\":\"B\"}', '2026-10-30T00:00:00Z')",
            params![local_id],
        ).expect("local B");
        insert_outbox(&connection, "pending-y", local_id, "PENDING");

        let tx = connection.transaction().expect("tx");
        apply_server_consultation(
            &tx,
            &server_consultation("consultation-newer", "patient-newer", 3, "web edit"),
            "2026-10-30T10:00:01Z",
            true,
        )
        .expect("newer server version");
        tx.commit().expect("commit");

        assert_eq!(open_conflicts(&connection), 1);
        let payload: String = connection
            .query_row(
                "SELECT payload FROM consultations WHERE local_id=?1",
                params![local_id],
                |r| r.get(0),
            )
            .expect("local");
        assert_eq!(payload, "{\"chiefComplaint\":\"B\"}");
    }

    #[test]
    fn synced_draft_save_queues_update_and_conflict_is_retained() {
        let mut connection = memory_db();
        insert_patient(&connection, "patient-update");
        let saved = save_prescription_draft_on_connection(
            &mut connection,
            &test_claims(),
            prescription_input("patient-update", None),
        )
        .expect("create");
        apply_push_results_on_connection(&mut connection, &[json!({
            "operationId": saved.operation_id, "entityType":"PRESCRIPTION", "localEntityId":saved.local_id,
            "status":"ACK", "serverEntityId":"rx-server-update", "serverVersion":1
        })]).expect("ack");
        let updated = save_prescription_draft_on_connection(
            &mut connection,
            &test_claims(),
            prescription_input("patient-update", Some(saved.local_id.clone())),
        )
        .expect("update");
        let operation: String = connection
            .query_row(
                "SELECT operation FROM sync_outbox WHERE operation_id=?1",
                params![updated.operation_id],
                |r| r.get(0),
            )
            .expect("update operation");
        assert_eq!(operation, "UPDATE");
        apply_push_results_on_connection(&mut connection, &[json!({
            "operationId": updated.operation_id, "entityType":"PRESCRIPTION", "localEntityId":saved.local_id,
            "status":"CONFLICT", "code":"SYNC_CONFLICT", "localVersion":1, "serverVersion":2,
            "localPayload":{}, "serverPayload":server_prescription("rx-server-update", "patient-update", "DRAFT", 2)
        })]).expect("conflict");
        let state: String = connection
            .query_row(
                "SELECT local_status FROM prescription_drafts WHERE local_id=?1",
                params![saved.local_id],
                |r| r.get(0),
            )
            .expect("state");
        assert_eq!(state, "CONFLICT");
    }

    #[test]
    fn prescription_not_editable_applies_server_terminal_state_without_retrying() {
        let mut connection = memory_db();
        insert_patient(&connection, "patient-read-only");
        let created = save_prescription_draft_on_connection(
            &mut connection,
            &test_claims(),
            prescription_input("patient-read-only", None),
        )
        .expect("create");
        apply_push_results_on_connection(
            &mut connection,
            &[json!({
                "operationId": created.operation_id,
                "entityType": "PRESCRIPTION",
                "localEntityId": created.local_id,
                "status": "ACK",
                "serverEntityId": "rx-read-only",
                "serverVersion": 1,
            })],
        )
        .expect("ack");
        let update = save_prescription_draft_on_connection(
            &mut connection,
            &test_claims(),
            prescription_input("patient-read-only", Some(created.local_id.clone())),
        )
        .expect("update");
        apply_push_results_on_connection(
            &mut connection,
            &[json!({
                "operationId": update.operation_id,
                "entityType": "PRESCRIPTION",
                "localEntityId": created.local_id,
                "status": "CONFLICT",
                "code": "PRESCRIPTION_NOT_EDITABLE",
                "localVersion": 1,
                "serverVersion": 2,
                "localPayload": {},
                "serverPayload": server_prescription(
                    "rx-read-only",
                    "patient-read-only",
                    "VALIDATED",
                    2,
                ),
            })],
        )
        .expect("not editable");
        let row: (String, String, i64, String) = connection
            .query_row(
                "SELECT local_status, server_status, base_version, number
                 FROM prescription_drafts WHERE local_id=?1",
                params![created.local_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .expect("read-only row");
        assert_eq!(
            row,
            (
                "READ_ONLY".to_string(),
                "VALIDATED".to_string(),
                2,
                "ORD-2026-000001".to_string(),
            )
        );
        let status: String = connection
            .query_row(
                "SELECT status FROM sync_outbox WHERE operation_id=?1",
                params![update.operation_id],
                |r| r.get(0),
            )
            .expect("outbox conflict");
        assert_eq!(status, "CONFLICT");
    }

    #[test]
    fn validated_pull_is_read_only_and_clean_tombstone_purges() {
        let mut connection = memory_db();
        insert_patient(&connection, "patient-terminal");
        let tx = connection.transaction().expect("tx");
        apply_server_prescription(
            &tx,
            &server_prescription("rx-terminal", "patient-terminal", "DRAFT", 1),
            "2026-10-29T10:00:00.000Z",
            false,
        )
        .expect("draft");
        apply_server_prescription(
            &tx,
            &server_prescription("rx-terminal", "patient-terminal", "VALIDATED", 2),
            "2026-10-29T10:01:00.000Z",
            true,
        )
        .expect("validated");
        tx.commit().expect("commit");
        let row: (String, String) = connection.query_row(
            "SELECT local_status, number FROM prescription_drafts WHERE server_id='rx-terminal'", [], |r| Ok((r.get(0)?, r.get(1)?)),
        ).expect("validated row");
        assert_eq!(
            row,
            ("READ_ONLY".to_string(), "ORD-2026-000001".to_string())
        );
        let tx = connection.transaction().expect("tx");
        apply_prescription_tombstone(
            &tx,
            &json!({"entityId":"rx-terminal","payload":{}}),
            "2026-10-29T10:02:00.000Z",
        )
        .expect("tombstone");
        tx.commit().expect("commit");
        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM prescription_drafts WHERE server_id='rx-terminal'",
                [],
                |r| r.get(0),
            )
            .expect("count");
        assert_eq!(count, 0);
    }

    #[test]
    fn canceled_pull_is_read_only() {
        let mut connection = memory_db();
        insert_patient(&connection, "patient-canceled");
        let tx = connection.transaction().expect("tx");
        apply_server_prescription(
            &tx,
            &server_prescription("rx-canceled", "patient-canceled", "CANCELED", 3),
            "2026-10-29T10:00:00.000Z",
            false,
        )
        .expect("canceled");
        tx.commit().expect("commit");
        let state: String = connection
            .query_row(
                "SELECT local_status FROM prescription_drafts WHERE server_id='rx-canceled'",
                [],
                |r| r.get(0),
            )
            .expect("read only");
        assert_eq!(state, "READ_ONLY");
    }

    #[test]
    fn pending_prescription_tombstone_and_scope_removal_lock_the_patient() {
        let mut connection = memory_db();
        insert_patient(&connection, "patient-pending-rx");
        let saved = save_prescription_draft_on_connection(
            &mut connection,
            &test_claims(),
            prescription_input("patient-pending-rx", None),
        )
        .expect("save");
        apply_push_results_on_connection(&mut connection, &[json!({
            "operationId": saved.operation_id, "entityType":"PRESCRIPTION", "localEntityId":saved.local_id,
            "status":"ACK", "serverEntityId":"rx-pending", "serverVersion":1
        })]).expect("ack");
        save_prescription_draft_on_connection(
            &mut connection,
            &test_claims(),
            prescription_input("patient-pending-rx", Some(saved.local_id.clone())),
        )
        .expect("pending update");
        let tx = connection.transaction().expect("tx");
        apply_prescription_tombstone(
            &tx,
            &json!({"entityId":"rx-pending","payload":{}}),
            "2026-10-29T10:00:00.000Z",
        )
        .expect("pending tombstone");
        reconcile_patients_tx(&tx, &[]).expect("scope removal");
        tx.commit().expect("commit");
        let locked: i64 = connection
            .query_row(
                "SELECT locked FROM patients WHERE server_id='patient-pending-rx'",
                [],
                |r| r.get(0),
            )
            .expect("locked");
        assert_eq!(locked, 1);
        let local: String = connection
            .query_row(
                "SELECT local_status FROM prescription_drafts WHERE local_id=?1",
                params![saved.local_id],
                |r| r.get(0),
            )
            .expect("draft remains");
        assert_eq!(local, "CONFLICT");
    }

    fn patient_count(connection: &Connection, where_sql: &str) -> i64 {
        connection
            .query_row(
                &format!("SELECT COUNT(*) FROM patients WHERE {where_sql}"),
                [],
                |row| row.get(0),
            )
            .expect("count")
    }

    #[test]
    fn locked_columns_survive_the_local_migrations() {
        let connection = memory_db();
        assert_eq!(patient_count(&connection, "locked=0"), 0);
    }

    #[test]
    fn clean_patient_out_of_scope_is_purged() {
        let mut connection = memory_db();
        insert_patient(&connection, "patient-kept");
        insert_patient(&connection, "patient-gone");
        insert_consultation(&connection, "local-1", "patient-gone");
        connection
            .execute(
                "INSERT INTO patient_medical_summaries(patient_server_id, payload, server_updated_at, last_synced_at)
                 VALUES ('patient-gone', '{}', '2026-10-28T00:00:00Z', '2026-10-28T00:00:00Z')",
                [],
            )
            .expect("summary");
        connection
            .execute(
                "INSERT INTO appointments_cache(server_id, patient_server_id, payload, server_updated_at, last_synced_at)
                 VALUES ('appointment-1', 'patient-gone', '{}', '2026-10-28T00:00:00Z', '2026-10-28T00:00:00Z')",
                [],
            )
            .expect("appointment");
        // A pending consultation of ANOTHER patient must survive untouched.
        insert_patient(&connection, "patient-other");
        insert_consultation(&connection, "local-other", "patient-other");
        insert_outbox(&connection, "op-1", "local-other", "PENDING");

        let tx = connection.transaction().expect("tx");
        reconcile_patients_tx(
            &tx,
            &["patient-kept".to_string(), "patient-other".to_string()],
        )
        .expect("reconcile");
        tx.commit().expect("commit");

        assert_eq!(patient_count(&connection, "locked=0"), 2);
        assert_eq!(patient_count(&connection, "server_id='patient-gone'"), 0);
        let summaries: i64 = connection
            .query_row("SELECT COUNT(*) FROM patient_medical_summaries", [], |r| {
                r.get(0)
            })
            .expect("summaries");
        assert_eq!(summaries, 0);
        let appointments: i64 = connection
            .query_row("SELECT COUNT(*) FROM appointments_cache", [], |r| r.get(0))
            .expect("appointments");
        assert_eq!(appointments, 0);
        let other_outbox: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sync_outbox WHERE local_entity_id='local-other'",
                [],
                |r| r.get(0),
            )
            .expect("outbox");
        assert_eq!(other_outbox, 1, "outbox d'un autre patient intact");
        let other_patient: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM consultations WHERE patient_server_id='patient-other'",
                [],
                |r| r.get(0),
            )
            .expect("consult");
        assert_eq!(other_patient, 1);
    }

    #[test]
    fn pending_patient_out_of_scope_is_locked_not_purged() {
        let mut connection = memory_db();
        insert_patient(&connection, "patient-kept");
        insert_patient(&connection, "patient-pending");
        insert_consultation(&connection, "local-pending", "patient-pending");
        insert_outbox(&connection, "op-2", "local-pending", "PENDING");

        let tx = connection.transaction().expect("tx");
        reconcile_patients_tx(&tx, &["patient-kept".to_string()]).expect("reconcile");
        tx.commit().expect("commit");

        assert_eq!(
            patient_count(&connection, "server_id='patient-pending' AND locked=1"),
            1,
            "patient conservé mais verrouillé"
        );
        let reason: String = connection
            .query_row(
                "SELECT lock_reason FROM patients WHERE server_id='patient-pending'",
                [],
                |r| r.get(0),
            )
            .expect("reason");
        assert_eq!(reason, SCOPE_REVOKED_LOCK_REASON);
        let consult: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM consultations WHERE local_id='local-pending'",
                [],
                |r| r.get(0),
            )
            .expect("consult");
        assert_eq!(consult, 1, "donnée clinique intacte");
    }

    // The Cloud rejected the operation of a patient who left the scope: the
    // work is still only here. It must keep the folder locked, session after
    // session; an acknowledged operation is delivered work and lets it go.
    #[test]
    fn rejected_or_conflicted_operations_keep_the_patient_locked_but_acknowledged_ones_do_not() {
        for (status, locked) in [
            ("REJECTED", true),
            ("CONFLICT", true),
            ("PENDING", true),
            ("ACK", false),
        ] {
            let mut connection = memory_db();
            insert_patient(&connection, "patient-kept");
            insert_patient(&connection, "patient-left");
            insert_consultation(&connection, "local-left", "patient-left");
            insert_outbox(&connection, "op-left", "local-left", status);

            for _session in 0..3 {
                let tx = connection.transaction().expect("tx");
                reconcile_patients_tx(&tx, &["patient-kept".to_string()]).expect("reconcile");
                tx.commit().expect("commit");
            }

            let remaining = patient_count(&connection, "server_id='patient-left'");
            let consultations: i64 = connection
                .query_row(
                    "SELECT COUNT(*) FROM consultations WHERE local_id='local-left'",
                    [],
                    |r| r.get(0),
                )
                .expect("consultations");
            if locked {
                assert_eq!(remaining, 1, "{status}: the folder is kept");
                assert_eq!(
                    patient_count(&connection, "server_id='patient-left' AND locked=1"),
                    1,
                    "{status}: and locked"
                );
                assert_eq!(consultations, 1, "{status}: the work is intact");
            } else {
                assert_eq!(remaining, 0, "{status}: delivered work lets the folder go");
                assert_eq!(consultations, 0, "{status}: and its data with it");
            }
        }
    }

    #[test]
    fn conflicted_patient_is_locked_with_explicit_state() {
        let mut connection = memory_db();
        insert_patient(&connection, "patient-kept");
        insert_patient(&connection, "patient-conflict");
        insert_consultation(&connection, "local-conflict", "patient-conflict");
        connection
            .execute(
                "INSERT INTO sync_conflicts(id, entity_type, entity_id, local_version, server_version, local_payload, server_payload, detected_at, status)
                 VALUES ('conflict-1', 'CONSULTATION', 'local-conflict', 1, 2, '{}', '{}', '2026-10-28T00:00:00Z', 'OPEN')",
                [],
            )
            .expect("conflict");

        let tx = connection.transaction().expect("tx");
        reconcile_patients_tx(&tx, &["patient-kept".to_string()]).expect("reconcile");
        tx.commit().expect("commit");

        assert_eq!(
            patient_count(&connection, "server_id='patient-conflict' AND locked=1"),
            1
        );
    }

    #[test]
    fn patient_back_in_scope_unlocks() {
        let mut connection = memory_db();
        insert_patient(&connection, "patient-back");
        connection
            .execute(
                "UPDATE patients SET locked=1, lock_reason=?1 WHERE server_id='patient-back'",
                params![SCOPE_REVOKED_LOCK_REASON],
            )
            .expect("lock");

        let tx = connection.transaction().expect("tx");
        reconcile_patients_tx(&tx, &["patient-back".to_string()]).expect("reconcile");
        tx.commit().expect("commit");

        assert_eq!(
            patient_count(&connection, "server_id='patient-back' AND locked=0"),
            1
        );
    }

    #[test]
    fn removed_patient_tombstone_locks_or_purges_by_local_state() {
        assert_eq!(
            decide_removal(true, false),
            ScopeRemoval::Lock,
            "PATIENT_DELETED_WITH_PENDING_DATA policy"
        );
        assert_eq!(
            PATIENT_DELETED_LOCK_REASON,
            "PATIENT_DELETED_WITH_PENDING_DATA"
        );
    }
}
