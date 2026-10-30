// Read-only views over the local encrypted database for the Desktop pages:
// the agenda, the consultations and the prescriptions of the whole workspace.
// Nothing here writes, and nothing changes the schema or the sync protocol.
//
// Every list joins `patients`: the rows of a patient who is no longer on the
// device (purged when leaving the authorized scope) never appear, even if a
// stray row were left behind.

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

use crate::consultation::{normalize_diagnoses, normalize_vitals};
use crate::database::{open, EngineEnv};

const LIST_LIMIT: i64 = 500;

fn full_name(first: Option<String>, last: Option<String>) -> String {
    [first, last]
        .into_iter()
        .flatten()
        .filter(|part| !part.trim().is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn parse(payload: &str, what: &str) -> Result<Value, String> {
    serde_json::from_str(payload).map_err(|_| format!("{what} local corrompu."))
}

fn text(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_string)
}

// ---------------------------------------------------------------------------
// Appointments (cloud -> desktop cache, read-only)
// ---------------------------------------------------------------------------

pub fn list_appointments(app: &EngineEnv, from: &str, to: &str) -> Result<Vec<Value>, String> {
    list_appointments_on(&open(app)?, from, to)
}

// `from` is inclusive and `to` exclusive, both ISO-8601 instants. Sorted by
// time, then by id so the order is stable.
fn list_appointments_on(
    connection: &Connection,
    from: &str,
    to: &str,
) -> Result<Vec<Value>, String> {
    let mut statement = connection
        .prepare(
            "SELECT a.server_id, a.patient_server_id, a.payload,
                    json_extract(p.payload, '$.firstName'),
                    json_extract(p.payload, '$.lastName'), p.locked
             FROM appointments_cache a
             JOIN patients p ON p.server_id = a.patient_server_id
             WHERE datetime(json_extract(a.payload, '$.scheduledAt')) >= datetime(?1)
               AND datetime(json_extract(a.payload, '$.scheduledAt')) < datetime(?2)
             ORDER BY datetime(json_extract(a.payload, '$.scheduledAt')),
                      json_extract(a.payload, '$.scheduledAt'), a.server_id
             LIMIT ?3",
        )
        .map_err(|_| "Rendez-vous locaux indisponibles.".to_string())?;
    let rows = statement
        .query_map(params![from, to, LIST_LIMIT], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, i64>(5)?,
            ))
        })
        .map_err(|_| "Rendez-vous locaux illisibles.".to_string())?;
    let mut appointments = Vec::new();
    for row in rows {
        let (id, patient_id, payload, first, last, locked) =
            row.map_err(|_| "Rendez-vous local illisible.".to_string())?;
        let payload = parse(&payload, "Rendez-vous")?;
        appointments.push(json!({
            "id": id,
            "patientId": patient_id,
            "patientName": full_name(first, last),
            "patientLocked": locked != 0,
            "scheduledAt": text(&payload, "scheduledAt"),
            "durationMinutes": payload.get("durationMinutes").cloned().unwrap_or(Value::Null),
            "reason": text(&payload, "reason"),
            "status": text(&payload, "status"),
        }));
    }
    Ok(appointments)
}

// ---------------------------------------------------------------------------
// Consultations
// ---------------------------------------------------------------------------

struct ConsultationRow {
    local_id: String,
    server_id: Option<String>,
    patient_id: String,
    local_status: String,
    payload: String,
    updated_at: String,
    first_name: Option<String>,
    last_name: Option<String>,
    patient_locked: bool,
    pending_sync: bool,
    in_conflict: bool,
}

const CONSULTATION_COLUMNS: &str = "
    c.local_id, c.server_id, c.patient_server_id, c.local_status, c.payload, c.updated_at,
    json_extract(p.payload, '$.firstName'), json_extract(p.payload, '$.lastName'), p.locked,
    EXISTS(SELECT 1 FROM sync_outbox o
           WHERE o.entity_type='CONSULTATION' AND o.local_entity_id=c.local_id
             AND o.status IN ('PENDING','RETRYABLE')),
    EXISTS(SELECT 1 FROM sync_outbox o
           WHERE o.entity_type='CONSULTATION' AND o.local_entity_id=c.local_id
             AND o.status='CONFLICT')
      OR EXISTS(SELECT 1 FROM sync_conflicts k
           WHERE k.entity_type='CONSULTATION' AND k.entity_id=c.local_id AND k.status='OPEN')";

fn consultation_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ConsultationRow> {
    Ok(ConsultationRow {
        local_id: row.get(0)?,
        server_id: row.get(1)?,
        patient_id: row.get(2)?,
        local_status: row.get(3)?,
        payload: row.get(4)?,
        updated_at: row.get(5)?,
        first_name: row.get(6)?,
        last_name: row.get(7)?,
        patient_locked: row.get::<_, i64>(8)? != 0,
        pending_sync: row.get::<_, i64>(9)? != 0,
        in_conflict: row.get::<_, i64>(10)? != 0,
    })
}

// The state the pages show, deduced from the consultation and the outbox:
//   CONFLICT      the server and this device disagree (needs attention)
//   SYNCED        on the server, nothing left to send
//   PENDING_SYNC  marked ready, or changed after a sync: waiting for the network
//   DRAFT         a local draft (LOCAL_DRAFT / IN_PROGRESS)
fn consultation_state(row: &ConsultationRow) -> &'static str {
    if row.in_conflict || row.local_status == "CONFLICT" {
        "CONFLICT"
    } else if row.local_status == "SYNCED" && !row.pending_sync {
        "SYNCED"
    } else if row.local_status == "READY_TO_SYNC" || row.local_status == "SYNCED" {
        "PENDING_SYNC"
    } else {
        "DRAFT"
    }
}

fn is_editable(row: &ConsultationRow) -> bool {
    !row.patient_locked
        && !row.in_conflict
        && matches!(
            row.local_status.as_str(),
            "LOCAL_DRAFT" | "IN_PROGRESS" | "READY_TO_SYNC"
        )
}

fn consultation_date(payload: &Value, updated_at: &str) -> String {
    text(payload, "startedAt")
        .or_else(|| text(payload, "createdAt"))
        .unwrap_or_else(|| updated_at.to_string())
}

pub fn list_consultations(app: &EngineEnv, patient_id: Option<&str>) -> Result<Vec<Value>, String> {
    list_consultations_on(&open(app)?, patient_id)
}

// Most recent first.
fn list_consultations_on(
    connection: &Connection,
    patient_id: Option<&str>,
) -> Result<Vec<Value>, String> {
    let mut statement = connection
        .prepare(&format!(
            "SELECT {CONSULTATION_COLUMNS}
             FROM consultations c JOIN patients p ON p.server_id = c.patient_server_id
             WHERE (?1 IS NULL OR c.patient_server_id = ?1)
             ORDER BY c.updated_at DESC, c.local_id LIMIT ?2"
        ))
        .map_err(|_| "Consultations locales indisponibles.".to_string())?;
    let rows = statement
        .query_map(params![patient_id, LIST_LIMIT], consultation_row)
        .map_err(|_| "Consultations locales illisibles.".to_string())?;
    let mut items = Vec::new();
    for row in rows {
        let row = row.map_err(|_| "Consultation locale illisible.".to_string())?;
        let payload = parse(&row.payload, "Consultation")?;
        let first_diagnosis = first_diagnosis(connection, &row.local_id, &payload);
        items.push((
            consultation_date(&payload, &row.updated_at),
            json!({
                "localId": row.local_id,
                "serverId": row.server_id,
                "patientId": row.patient_id,
                "patientName": full_name(row.first_name.clone(), row.last_name.clone()),
                "patientLocked": row.patient_locked,
                "date": consultation_date(&payload, &row.updated_at),
                "appointmentId": text(&payload, "appointmentId"),
                "chiefComplaint": text(&payload, "chiefComplaint"),
                "firstDiagnosis": first_diagnosis,
                "status": text(&payload, "status"),
                "localStatus": row.local_status,
                "state": consultation_state(&row),
                "pendingSync": row.pending_sync,
                "editable": is_editable(&row),
            }),
        ));
    }
    // Dates are ISO-8601 strings: most recent first, the query order breaks ties.
    items.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(items.into_iter().map(|(_, value)| value).collect())
}

fn first_diagnosis(connection: &Connection, local_id: &str, payload: &Value) -> Option<String> {
    let from_table: Option<String> = connection
        .query_row(
            "SELECT json_extract(payload, '$.label') FROM consultation_diagnoses
             WHERE consultation_local_id=?1 ORDER BY position LIMIT 1",
            params![local_id],
            |row| row.get(0),
        )
        .optional()
        .ok()
        .flatten()
        .flatten();
    from_table.or_else(|| {
        payload
            .get("diagnoses")
            .and_then(Value::as_array)
            .and_then(|list| list.first())
            .and_then(|diagnosis| text(diagnosis, "label"))
    })
}

pub fn get_consultation(app: &EngineEnv, local_id: &str) -> Result<Value, String> {
    get_consultation_on(&open(app)?, local_id)
}

fn get_consultation_on(connection: &Connection, local_id: &str) -> Result<Value, String> {
    let row = connection
        .query_row(
            &format!(
                "SELECT {CONSULTATION_COLUMNS}
                 FROM consultations c JOIN patients p ON p.server_id = c.patient_server_id
                 WHERE c.local_id = ?1"
            ),
            params![local_id],
            consultation_row,
        )
        .optional()
        .map_err(|_| "Consultation locale illisible.".to_string())?
        .ok_or_else(|| "Consultation locale introuvable.".to_string())?;
    let payload = parse(&row.payload, "Consultation")?;

    let vitals: Option<String> = connection
        .query_row(
            "SELECT payload FROM consultation_vitals WHERE consultation_local_id=?1",
            params![local_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|_| "Constantes locales illisibles.".to_string())?;
    let vital_signs = normalize_vitals(&match vitals {
        Some(raw) => parse(&raw, "Constantes")?,
        None => payload.get("vitalSigns").cloned().unwrap_or(Value::Null),
    });

    let mut statement = connection
        .prepare(
            "SELECT payload FROM consultation_diagnoses
             WHERE consultation_local_id=?1 ORDER BY position",
        )
        .map_err(|_| "Diagnostics locaux indisponibles.".to_string())?;
    let stored = statement
        .query_map(params![local_id], |r| r.get::<_, String>(0))
        .map_err(|_| "Diagnostics locaux illisibles.".to_string())?
        .map(|raw| {
            let raw = raw.map_err(|_| "Diagnostic local illisible.".to_string())?;
            parse(&raw, "Diagnostic")
        })
        .collect::<Result<Vec<_>, _>>()?;
    let diagnoses = normalize_diagnoses(&if stored.is_empty() {
        payload
            .get("diagnoses")
            .cloned()
            .unwrap_or_else(|| Value::Array(Vec::new()))
    } else {
        Value::Array(stored)
    });

    Ok(json!({
        "localId": row.local_id,
        "serverId": row.server_id,
        "patientId": row.patient_id,
        "patientName": full_name(row.first_name.clone(), row.last_name.clone()),
        "patientLocked": row.patient_locked,
        "date": consultation_date(&payload, &row.updated_at),
        "status": text(&payload, "status"),
        "localStatus": row.local_status,
        "state": consultation_state(&row),
        "pendingSync": row.pending_sync,
        "editable": is_editable(&row),
        "appointmentId": text(&payload, "appointmentId"),
        "startedAt": text(&payload, "startedAt"),
        "completedAt": text(&payload, "completedAt"),
        "chiefComplaint": text(&payload, "chiefComplaint").unwrap_or_default(),
        "historyPresentIllness": text(&payload, "historyPresentIllness").unwrap_or_default(),
        "clinicalExamination": text(&payload, "clinicalExamination").unwrap_or_default(),
        "assessment": text(&payload, "assessment").unwrap_or_default(),
        "carePlan": text(&payload, "carePlan").unwrap_or_default(),
        "followUpPlan": text(&payload, "followUpPlan").unwrap_or_default(),
        "vitalSigns": vital_signs,
        "diagnoses": diagnoses,
        "addenda": payload.get("addenda").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
    }))
}

// ---------------------------------------------------------------------------
// Prescriptions
// ---------------------------------------------------------------------------

pub fn list_prescriptions(app: &EngineEnv, patient_id: Option<&str>) -> Result<Vec<Value>, String> {
    list_prescriptions_on(&open(app)?, patient_id)
}

// The workspace-wide version of `list_patient_prescriptions`, with the patient
// and the medications. Most recent first.
fn list_prescriptions_on(
    connection: &Connection,
    patient_id: Option<&str>,
) -> Result<Vec<Value>, String> {
    let mut statement = connection
        .prepare(
            "SELECT d.local_id, d.server_id, d.patient_server_id, d.server_status, d.local_status,
                    d.prescription_type, d.valid_until, d.number, d.updated_at,
                    json_extract(p.payload, '$.firstName'), json_extract(p.payload, '$.lastName'),
                    p.locked,
                    (SELECT COUNT(*) FROM prescription_items i WHERE i.prescription_local_id = d.local_id),
                    (SELECT group_concat(dci, ' · ') FROM (
                        SELECT json_extract(i.payload, '$.dci') AS dci FROM prescription_items i
                        WHERE i.prescription_local_id = d.local_id ORDER BY i.position))
             FROM prescription_drafts d JOIN patients p ON p.server_id = d.patient_server_id
             WHERE (?1 IS NULL OR d.patient_server_id = ?1)
             ORDER BY d.updated_at DESC, d.local_id LIMIT ?2",
        )
        .map_err(|_| "Ordonnances locales indisponibles.".to_string())?;
    let rows = statement
        .query_map(params![patient_id, LIST_LIMIT], |row| {
            let first: Option<String> = row.get(9)?;
            let last: Option<String> = row.get(10)?;
            Ok(json!({
                "localId": row.get::<_, String>(0)?,
                "serverId": row.get::<_, Option<String>>(1)?,
                "patientId": row.get::<_, String>(2)?,
                "serverStatus": row.get::<_, Option<String>>(3)?,
                "localStatus": row.get::<_, String>(4)?,
                "type": row.get::<_, String>(5)?,
                "validUntil": row.get::<_, Option<String>>(6)?,
                "number": row.get::<_, Option<String>>(7)?,
                "updatedAt": row.get::<_, String>(8)?,
                "patientName": full_name(first, last),
                "patientLocked": row.get::<_, i64>(11)? != 0,
                "itemCount": row.get::<_, i64>(12)?,
                "medications": row.get::<_, Option<String>>(13)?,
            }))
        })
        .map_err(|_| "Ordonnances locales illisibles.".to_string())?;
    rows.map(|row| row.map_err(|_| "Ordonnance locale illisible.".to_string()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::{memory_db_for_tests, purge_patient_for_tests};

    fn patient(connection: &Connection, id: &str, first: &str, last: &str, locked: bool) {
        connection
            .execute(
                "INSERT INTO patients(server_id, workspace_id, search_text, payload, server_updated_at, last_synced_at, locked)
                 VALUES (?1, 'ws-1', ?2, ?3, '2026-10-28T00:00:00Z', '2026-10-28T00:00:00Z', ?4)",
                params![
                    id,
                    format!("{first} {last}").to_lowercase(),
                    json!({ "firstName": first, "lastName": last }).to_string(),
                    locked as i64
                ],
            )
            .expect("patient");
    }

    fn appointment(connection: &Connection, id: &str, patient_id: &str, at: &str, status: &str) {
        connection
            .execute(
                "INSERT INTO appointments_cache(server_id, patient_server_id, payload, server_updated_at, last_synced_at)
                 VALUES (?1, ?2, ?3, '2026-10-28T00:00:00Z', '2026-10-28T00:00:00Z')",
                params![
                    id,
                    patient_id,
                    json!({ "id": id, "patientId": patient_id, "scheduledAt": at,
                            "durationMinutes": 30, "reason": "Contrôle", "status": status })
                    .to_string()
                ],
            )
            .expect("appointment");
    }

    fn consultation(
        connection: &Connection,
        local_id: &str,
        patient_id: &str,
        local_status: &str,
        updated_at: &str,
        payload: Value,
    ) {
        connection
            .execute(
                "INSERT INTO consultations(local_id, server_id, patient_server_id, local_status, payload, updated_at)
                 VALUES (?1, NULL, ?2, ?3, ?4, ?5)",
                params![local_id, patient_id, local_status, payload.to_string(), updated_at],
            )
            .expect("consultation");
    }

    fn outbox(connection: &Connection, id: &str, entity: &str, local_id: &str, status: &str) {
        connection
            .execute(
                "INSERT INTO sync_outbox(operation_id, device_id, entity_type, local_entity_id, operation, payload, occurred_at, sequence, status)
                 VALUES (?1, 'device-1', ?2, ?3, 'CREATE', '{}', '2026-10-28T00:00:00Z',
                         (SELECT COALESCE(MAX(sequence), 0) + 1 FROM sync_outbox), ?4)",
                params![id, entity, local_id, status],
            )
            .expect("outbox");
    }

    fn prescription(connection: &Connection, local_id: &str, patient_id: &str, updated_at: &str) {
        connection
            .execute(
                "INSERT INTO prescription_drafts(local_id, patient_server_id, payload, updated_at)
                 VALUES (?1, ?2, '{}', ?3)",
                params![local_id, patient_id, updated_at],
            )
            .expect("prescription");
    }

    fn item(connection: &Connection, id: &str, local_id: &str, position: i64, dci: &str) {
        connection
            .execute(
                "INSERT INTO prescription_items(id, prescription_local_id, position, payload) VALUES (?1, ?2, ?3, ?4)",
                params![id, local_id, position, json!({ "dci": dci }).to_string()],
            )
            .expect("item");
    }

    fn ids(values: &[Value], key: &str) -> Vec<String> {
        values
            .iter()
            .map(|value| value[key].as_str().unwrap_or_default().to_string())
            .collect()
    }

    #[test]
    fn empty_database_gives_empty_lists() {
        let connection = memory_db_for_tests();
        assert!(
            list_appointments_on(&connection, "2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z")
                .unwrap()
                .is_empty()
        );
        assert!(list_consultations_on(&connection, None).unwrap().is_empty());
        assert!(list_consultations_on(&connection, Some("p1"))
            .unwrap()
            .is_empty());
        assert!(list_prescriptions_on(&connection, None).unwrap().is_empty());
        assert!(get_consultation_on(&connection, "missing").is_err());
    }

    #[test]
    fn appointments_are_in_range_sorted_by_time_and_carry_the_patient_name() {
        let connection = memory_db_for_tests();
        patient(&connection, "p1", "Amine", "Benali", false);
        patient(&connection, "p2", "Samira", "Khelifi", true);
        appointment(
            &connection,
            "a3",
            "p1",
            "2026-10-30T14:00:00.000Z",
            "CONFIRMED",
        );
        appointment(
            &connection,
            "a1",
            "p2",
            "2026-10-30T08:30:00.000Z",
            "SCHEDULED",
        );
        appointment(
            &connection,
            "a2",
            "p1",
            "2026-10-30T09:00:00.000Z",
            "COMPLETED",
        );
        // Outside the day: the day before (excluded), and exactly the end (exclusive).
        appointment(
            &connection,
            "old",
            "p1",
            "2026-10-29T23:59:00.000Z",
            "COMPLETED",
        );
        appointment(
            &connection,
            "next",
            "p1",
            "2026-10-31T00:00:00.000Z",
            "SCHEDULED",
        );

        let day = list_appointments_on(
            &connection,
            "2026-10-30T00:00:00.000Z",
            "2026-10-31T00:00:00.000Z",
        )
        .unwrap();

        assert_eq!(ids(&day, "id"), vec!["a1", "a2", "a3"]);
        assert_eq!(day[0]["patientName"], "Samira Khelifi");
        assert_eq!(day[0]["patientLocked"], true);
        assert_eq!(day[1]["patientName"], "Amine Benali");
        assert_eq!(day[1]["status"], "COMPLETED");
        assert_eq!(day[1]["durationMinutes"], 30);
        assert_eq!(day[1]["reason"], "Contrôle");
    }

    #[test]
    fn appointments_of_patients_absent_from_the_device_are_excluded() {
        let connection = memory_db_for_tests();
        patient(&connection, "p1", "Amine", "Benali", false);
        appointment(
            &connection,
            "a1",
            "p1",
            "2026-10-30T09:00:00.000Z",
            "SCHEDULED",
        );
        // A row left for a patient that is not on this device.
        appointment(
            &connection,
            "ghost",
            "gone",
            "2026-10-30T10:00:00.000Z",
            "SCHEDULED",
        );

        let day = list_appointments_on(
            &connection,
            "2026-10-30T00:00:00.000Z",
            "2026-10-31T00:00:00.000Z",
        )
        .unwrap();

        assert_eq!(ids(&day, "id"), vec!["a1"]);
    }

    #[test]
    fn consultation_states_come_from_the_consultation_and_the_outbox() {
        let connection = memory_db_for_tests();
        patient(&connection, "p1", "Amine", "Benali", false);
        let payload = |complaint: &str| json!({ "chiefComplaint": complaint });
        consultation(
            &connection,
            "draft",
            "p1",
            "LOCAL_DRAFT",
            "2026-10-30T10:00:00Z",
            payload("Toux"),
        );
        consultation(
            &connection,
            "progress",
            "p1",
            "IN_PROGRESS",
            "2026-10-30T09:00:00Z",
            payload("Fièvre"),
        );
        consultation(
            &connection,
            "ready",
            "p1",
            "READY_TO_SYNC",
            "2026-10-30T08:00:00Z",
            payload("Douleur"),
        );
        consultation(
            &connection,
            "synced",
            "p1",
            "SYNCED",
            "2026-10-29T08:00:00Z",
            payload("Suivi"),
        );
        consultation(
            &connection,
            "resent",
            "p1",
            "SYNCED",
            "2026-10-28T08:00:00Z",
            payload("Suivi 2"),
        );
        consultation(
            &connection,
            "clash",
            "p1",
            "LOCAL_DRAFT",
            "2026-10-27T08:00:00Z",
            payload("Conflit"),
        );
        consultation(
            &connection,
            "clash2",
            "p1",
            "SYNCED",
            "2026-10-26T08:00:00Z",
            payload("Conflit 2"),
        );
        outbox(&connection, "o1", "CONSULTATION", "ready", "PENDING");
        outbox(&connection, "o2", "CONSULTATION", "resent", "RETRYABLE");
        outbox(&connection, "o3", "CONSULTATION", "clash", "CONFLICT");
        connection
            .execute(
                "INSERT INTO sync_conflicts(id, entity_type, entity_id, local_payload, server_payload, detected_at, status)
                 VALUES ('k1', 'CONSULTATION', 'clash2', '{}', '{}', '2026-10-28T00:00:00Z', 'OPEN')",
                [],
            )
            .unwrap();

        let list = list_consultations_on(&connection, None).unwrap();
        let state = |id: &str| {
            list.iter()
                .find(|item| item["localId"] == id)
                .map(|item| item["state"].as_str().unwrap().to_string())
                .unwrap()
        };

        assert_eq!(state("draft"), "DRAFT");
        assert_eq!(state("progress"), "DRAFT");
        assert_eq!(state("ready"), "PENDING_SYNC");
        assert_eq!(state("synced"), "SYNCED");
        assert_eq!(state("resent"), "PENDING_SYNC");
        assert_eq!(state("clash"), "CONFLICT");
        assert_eq!(state("clash2"), "CONFLICT");
        // Only a draft the doctor may still edit is editable.
        let editable =
            |id: &str| list.iter().find(|item| item["localId"] == id).unwrap()["editable"].clone();
        assert_eq!(editable("draft"), true);
        assert_eq!(editable("ready"), true);
        assert_eq!(editable("synced"), false);
        assert_eq!(editable("clash"), false);
    }

    #[test]
    fn consultations_are_most_recent_first_and_filter_by_patient() {
        let connection = memory_db_for_tests();
        patient(&connection, "p1", "Amine", "Benali", false);
        patient(&connection, "p2", "Samira", "Khelifi", false);
        consultation(
            &connection,
            "c1",
            "p1",
            "SYNCED",
            "2026-10-20T10:00:00Z",
            json!({ "chiefComplaint": "Ancienne", "startedAt": "2026-10-20T09:00:00.000Z",
                    "diagnoses": [{ "label": "Rhinite", "isPrimary": true }] }),
        );
        consultation(
            &connection,
            "c2",
            "p2",
            "LOCAL_DRAFT",
            "2026-10-30T10:00:00Z",
            json!({ "chiefComplaint": "Récente" }),
        );
        consultation(
            &connection,
            "c3",
            "p1",
            "SYNCED",
            "2026-10-25T10:00:00Z",
            json!({ "chiefComplaint": "Milieu", "startedAt": "2026-10-25T09:00:00.000Z" }),
        );

        let all = list_consultations_on(&connection, None).unwrap();
        assert_eq!(ids(&all, "localId"), vec!["c2", "c3", "c1"]);
        assert_eq!(all[2]["firstDiagnosis"], "Rhinite");
        assert_eq!(all[0]["patientName"], "Samira Khelifi");
        assert_eq!(all[0]["chiefComplaint"], "Récente");

        let mine = list_consultations_on(&connection, Some("p1")).unwrap();
        assert_eq!(ids(&mine, "localId"), vec!["c3", "c1"]);
        assert!(list_consultations_on(&connection, Some("nobody"))
            .unwrap()
            .is_empty());
    }

    #[test]
    fn a_consultation_comes_back_whole_with_vitals_and_diagnoses() {
        let connection = memory_db_for_tests();
        patient(&connection, "p1", "Amine", "Benali", false);
        consultation(
            &connection,
            "c1",
            "p1",
            "SYNCED",
            "2026-10-25T10:00:00Z",
            json!({
                "status": "COMPLETED", "chiefComplaint": "Toux", "assessment": "Bronchite",
                "startedAt": "2026-10-25T09:00:00.000Z", "appointmentId": "a1",
                "vitalSigns": { "heartRate": 72 },
                "diagnoses": [{ "label": "Bronchite", "isPrimary": true }],
                "addenda": [{ "id": "x", "content": "Note" }]
            }),
        );
        let whole = get_consultation_on(&connection, "c1").unwrap();
        assert_eq!(whole["patientName"], "Amine Benali");
        assert_eq!(whole["chiefComplaint"], "Toux");
        assert_eq!(whole["assessment"], "Bronchite");
        assert_eq!(whole["historyPresentIllness"], "");
        assert_eq!(whole["vitalSigns"]["heartRate"], 72);
        assert_eq!(whole["diagnoses"][0]["label"], "Bronchite");
        assert_eq!(whole["appointmentId"], "a1");
        assert_eq!(whole["state"], "SYNCED");
        assert_eq!(whole["editable"], false);

        // Rows of the dedicated tables take precedence over the payload.
        connection
            .execute("INSERT INTO consultation_vitals(consultation_local_id, payload) VALUES ('c1', '{\"heartRate\":88}')", [])
            .unwrap();
        connection
            .execute("INSERT INTO consultation_diagnoses(id, consultation_local_id, position, payload) VALUES ('d2', 'c1', 1, '{\"label\":\"Second\"}'), ('d1', 'c1', 0, '{\"label\":\"Premier\"}')", [])
            .unwrap();
        let whole = get_consultation_on(&connection, "c1").unwrap();
        assert_eq!(whole["vitalSigns"]["heartRate"], 88);
        assert_eq!(whole["diagnoses"][0]["label"], "Premier");
        assert_eq!(whole["diagnoses"][1]["label"], "Second");
        let list = list_consultations_on(&connection, None).unwrap();
        assert_eq!(list[0]["firstDiagnosis"], "Premier");
    }

    #[test]
    fn a_locked_patient_consultation_is_not_editable() {
        let connection = memory_db_for_tests();
        patient(&connection, "p1", "Amine", "Benali", true);
        consultation(
            &connection,
            "c1",
            "p1",
            "LOCAL_DRAFT",
            "2026-10-25T10:00:00Z",
            json!({}),
        );
        let whole = get_consultation_on(&connection, "c1").unwrap();
        assert_eq!(whole["patientLocked"], true);
        assert_eq!(whole["editable"], false);
    }

    #[test]
    fn prescriptions_list_the_workspace_with_patient_and_medications() {
        let connection = memory_db_for_tests();
        patient(&connection, "p1", "Amine", "Benali", false);
        patient(&connection, "p2", "Samira", "Khelifi", false);
        prescription(&connection, "r1", "p1", "2026-10-20T10:00:00Z");
        item(&connection, "i1", "r1", 0, "Paracétamol");
        item(&connection, "i2", "r1", 1, "Amoxicilline");
        prescription(&connection, "r2", "p2", "2026-10-30T10:00:00Z");
        prescription(&connection, "r3", "p1", "2026-10-25T10:00:00Z");
        item(&connection, "i3", "r3", 0, "Ibuprofène");

        let all = list_prescriptions_on(&connection, None).unwrap();
        assert_eq!(ids(&all, "localId"), vec!["r2", "r3", "r1"]);
        assert_eq!(all[0]["patientName"], "Samira Khelifi");
        assert_eq!(all[0]["itemCount"], 0);
        assert_eq!(all[2]["itemCount"], 2);
        assert_eq!(all[2]["medications"], "Paracétamol · Amoxicilline");

        let mine = list_prescriptions_on(&connection, Some("p1")).unwrap();
        assert_eq!(ids(&mine, "localId"), vec!["r3", "r1"]);
        assert!(list_prescriptions_on(&connection, Some("nobody"))
            .unwrap()
            .is_empty());
    }

    #[test]
    fn nothing_of_a_purged_patient_remains_in_any_list() {
        let mut connection = memory_db_for_tests();
        patient(&connection, "p1", "Amine", "Benali", false);
        patient(&connection, "p2", "Samira", "Khelifi", false);
        for (id, who) in [("a1", "p1"), ("a2", "p2")] {
            appointment(
                &connection,
                id,
                who,
                "2026-10-30T09:00:00.000Z",
                "SCHEDULED",
            );
        }
        consultation(
            &connection,
            "c1",
            "p1",
            "SYNCED",
            "2026-10-25T10:00:00Z",
            json!({}),
        );
        consultation(
            &connection,
            "c2",
            "p2",
            "SYNCED",
            "2026-10-25T10:00:00Z",
            json!({}),
        );
        prescription(&connection, "r1", "p1", "2026-10-25T10:00:00Z");
        prescription(&connection, "r2", "p2", "2026-10-25T10:00:00Z");

        purge_patient_for_tests(&mut connection, "p1");

        let day = ("2026-10-30T00:00:00.000Z", "2026-10-31T00:00:00.000Z");
        assert_eq!(
            ids(
                &list_appointments_on(&connection, day.0, day.1).unwrap(),
                "id"
            ),
            vec!["a2"]
        );
        assert_eq!(
            ids(
                &list_consultations_on(&connection, None).unwrap(),
                "localId"
            ),
            vec!["c2"]
        );
        assert_eq!(
            ids(
                &list_prescriptions_on(&connection, None).unwrap(),
                "localId"
            ),
            vec!["r2"]
        );
        assert!(list_consultations_on(&connection, Some("p1"))
            .unwrap()
            .is_empty());
        assert!(get_consultation_on(&connection, "c1").is_err());
    }

    #[test]
    fn the_list_carries_the_appointment_a_consultation_was_started_from() {
        let connection = memory_db_for_tests();
        patient(&connection, "p1", "Amine", "Benali", false);
        consultation(
            &connection,
            "linked",
            "p1",
            "LOCAL_DRAFT",
            "2026-10-30T10:00:00Z",
            json!({ "chiefComplaint": "Toux", "appointmentId": "a1" }),
        );
        consultation(
            &connection,
            "free",
            "p1",
            "LOCAL_DRAFT",
            "2026-10-30T09:00:00Z",
            json!({ "chiefComplaint": "Suivi" }),
        );
        let list = list_consultations_on(&connection, None).unwrap();
        assert_eq!(list[0]["appointmentId"], "a1");
        assert_eq!(list[1]["appointmentId"], Value::Null);
    }

    #[test]
    fn a_consultation_comes_back_with_its_vital_signs_and_diagnoses_in_the_shape_the_editor_sends()
    {
        let connection = memory_db_for_tests();
        patient(&connection, "p1", "Amine", "Benali", false);
        consultation(
            &connection,
            "c1",
            "p1",
            "SYNCED",
            "2026-10-25T10:00:00Z",
            json!({
                "vitalSigns": { "id": "v1", "consultationId": "c1", "systolicBp": 130, "heartRate": null, "createdAt": "x" },
                "diagnoses": [{ "id": "d1", "label": "Bronchite", "code": null, "isPrimary": true, "createdAt": "x" }]
            }),
        );
        let whole = get_consultation_on(&connection, "c1").unwrap();
        assert_eq!(whole["vitalSigns"], json!({ "systolicBp": 130 }));
        assert_eq!(
            whole["diagnoses"],
            json!([{ "label": "Bronchite", "isPrimary": true }])
        );
    }
}
