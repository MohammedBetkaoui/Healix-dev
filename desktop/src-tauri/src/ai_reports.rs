// Validated AI results on the device: the conclusions a physician validated or
// corrected on the Web platform, kept read-only in the encrypted database so they
// can be consulted offline. The desktop never starts an analysis and never holds
// an image, a mask, a path or a PDF: only a conclusion, a few figures and where
// the answer came from.
//
// They come from GET /sync/ai-reports, a separate call that is not part of the
// synchronization protocol (no operation, no cursor): the answer replaces the
// cache, and what its `runIds` no longer lists is dropped. A failure of that call
// is never a failure of the sync; it only leaves the previous results in place and
// a warning behind.

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{Map, Value};
use std::collections::HashSet;

use crate::database::{now_iso, open, EngineEnv};

const LIST_LIMIT: i64 = 500;
const MAX_PREDICTIONS: usize = 3;

// Kept as text (or null) whatever else the server may add.
const TEXT_KEYS: [&str; 14] = [
    "moduleLabel",
    "createdAt",
    "decidedAt",
    "decisionStatus",
    "decisionLabel",
    "clinicianImpression",
    "modelDecision",
    "classificationModelId",
    "classificationWeightsSha12",
    "segmentationModelId",
    "segmentationWeightsSha12",
    "decidedByName",
    "reportNumber",
    "reportSha256",
];
const LIST_KEYS: [&str; 2] = ["decisionLabels", "modelLabels"];

fn text_or_null(source: &Map<String, Value>, key: &str) -> Value {
    match source.get(key) {
        Some(Value::String(text)) => Value::String(text.clone()),
        _ => Value::Null,
    }
}

fn string_list(value: Option<&Value>) -> Value {
    match value {
        Some(Value::Array(items)) => Value::Array(
            items
                .iter()
                .filter_map(|item| item.as_str().map(|text| Value::String(text.to_string())))
                .collect(),
        ),
        _ => Value::Null,
    }
}

fn predictions(value: Option<&Value>) -> Value {
    let kept: Vec<Value> = value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let label = item.get("label")?.as_str()?;
                    let probability = item.get("probability")?.as_f64()?;
                    Some(serde_json::json!({ "label": label, "probability": probability }))
                })
                .take(MAX_PREDICTIONS)
                .collect()
        })
        .unwrap_or_default();
    Value::Array(kept)
}

fn measures(value: Option<&Value>) -> Value {
    let mut kept = Map::new();
    if let Some(Value::Object(source)) = value {
        for (key, measure) in source {
            match measure {
                Value::Number(_) | Value::Null => {
                    kept.insert(key.clone(), measure.clone());
                }
                _ => {}
            }
        }
    }
    Value::Object(kept)
}

struct Kept {
    run_id: String,
    patient_id: String,
    pipeline: String,
    decided_at: String,
    payload: Value,
}

// Rebuilds a report from the keys the desktop knows, whatever arrives: a column
// the server adds tomorrow, or a path it should never send, is not kept. A
// report that is not VALIDATED or CORRECTED is not kept either.
fn sanitize(report: &Value) -> Option<Kept> {
    let source = report.as_object()?;
    let run_id = source.get("runId")?.as_str()?.to_string();
    let patient_id = source.get("patientId")?.as_str()?.to_string();
    let pipeline = source.get("pipeline")?.as_str()?.to_string();
    match source.get("decisionStatus")?.as_str()? {
        "VALIDATED" | "CORRECTED" => {}
        _ => return None,
    }
    let mut payload = Map::new();
    payload.insert("runId".into(), Value::String(run_id.clone()));
    payload.insert("patientId".into(), Value::String(patient_id.clone()));
    payload.insert("pipeline".into(), Value::String(pipeline.clone()));
    for key in TEXT_KEYS {
        payload.insert(key.into(), text_or_null(source, key));
    }
    for key in LIST_KEYS {
        payload.insert(key.into(), string_list(source.get(key)));
    }
    payload.insert(
        "topPredictions".into(),
        predictions(source.get("topPredictions")),
    );
    payload.insert("measures".into(), measures(source.get("measures")));
    let decided_at = source
        .get("decidedAt")
        .and_then(Value::as_str)
        .or_else(|| source.get("createdAt").and_then(Value::as_str))?
        .to_string();
    Some(Kept {
        run_id,
        patient_id,
        pipeline,
        decided_at,
        payload: Value::Object(payload),
    })
}

// Replaces the cache with the answer of the server, in one transaction: reports
// upserted, then everything `runIds` does not list removed. Only patients that
// are on the device and not locked get a row (the answer cannot bring a patient
// in). A malformed answer changes nothing.
pub(crate) fn apply_on(connection: &mut Connection, response: &Value) -> Result<usize, String> {
    let reports = response
        .get("reports")
        .and_then(Value::as_array)
        .ok_or_else(|| "Résultats IA absents de la réponse.".to_string())?;
    let run_ids: HashSet<&str> = response
        .get("runIds")
        .and_then(Value::as_array)
        .ok_or_else(|| "Liste des résultats IA absente de la réponse.".to_string())?
        .iter()
        .filter_map(Value::as_str)
        .collect();
    let tx = connection
        .transaction()
        .map_err(|_| "Transaction des résultats IA impossible.".to_string())?;
    let fetched_at = now_iso(&tx)?;
    let on_device: HashSet<String> = {
        let mut statement = tx
            .prepare("SELECT server_id FROM patients WHERE locked=0")
            .map_err(|_| "Patients locaux illisibles.".to_string())?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|_| "Patients locaux illisibles.".to_string())?;
        rows.collect::<Result<_, _>>()
            .map_err(|_| "Patients locaux illisibles.".to_string())?
    };

    let mut stored = 0;
    for report in reports {
        let Some(kept) = sanitize(report) else {
            continue;
        };
        if !run_ids.contains(kept.run_id.as_str()) || !on_device.contains(&kept.patient_id) {
            continue;
        }
        tx.execute(
            "INSERT INTO ai_report_cache(run_id, patient_server_id, pipeline, decided_at, payload, fetched_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(run_id) DO UPDATE SET
               patient_server_id=excluded.patient_server_id, pipeline=excluded.pipeline,
               decided_at=excluded.decided_at, payload=excluded.payload, fetched_at=excluded.fetched_at",
            params![
                kept.run_id,
                kept.patient_id,
                kept.pipeline,
                kept.decided_at,
                kept.payload.to_string(),
                fetched_at
            ],
        )
        .map_err(|_| "Résultat IA non enregistré.".to_string())?;
        stored += 1;
    }

    let cached: Vec<String> = {
        let mut statement = tx
            .prepare("SELECT run_id FROM ai_report_cache")
            .map_err(|_| "Résultats IA locaux illisibles.".to_string())?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|_| "Résultats IA locaux illisibles.".to_string())?;
        rows.collect::<Result<_, _>>()
            .map_err(|_| "Résultats IA locaux illisibles.".to_string())?
    };
    for run_id in cached.iter().filter(|id| !run_ids.contains(id.as_str())) {
        tx.execute(
            "DELETE FROM ai_report_cache WHERE run_id=?1",
            params![run_id],
        )
        .map_err(|_| "Résultat IA obsolète non supprimé.".to_string())?;
    }

    tx.execute(
        "UPDATE sync_state SET ai_reports_synced_at=?1, ai_reports_failed=0 WHERE id=1",
        params![fetched_at],
    )
    .map_err(|_| "État des résultats IA non enregistré.".to_string())?;
    tx.commit()
        .map_err(|_| "Résultats IA non enregistrés.".to_string())?;
    Ok(stored)
}

fn mark_failed_on(connection: &Connection) {
    // Nothing more to do if even this cannot be written: the previous results stay.
    let _ = connection.execute("UPDATE sync_state SET ai_reports_failed=1 WHERE id=1", []);
}

#[derive(Debug, PartialEq, Eq)]
pub enum Refresh {
    Updated(usize),
    // The previous results are untouched; the sync status carries the warning.
    Failed,
}

// What becomes of one attempt to refresh: the answer applied, or the failure
// recorded. It never returns an error, so that no caller can turn the failure of
// this call into the failure of a synchronization.
pub(crate) fn settle_on(connection: &mut Connection, fetched: Result<Value, String>) -> Refresh {
    match fetched.and_then(|response| apply_on(connection, &response)) {
        Ok(stored) => Refresh::Updated(stored),
        Err(_) => {
            mark_failed_on(connection);
            Refresh::Failed
        }
    }
}

pub fn settle(app: &EngineEnv, fetched: Result<Value, String>) -> Refresh {
    match open(app) {
        Ok(mut connection) => settle_on(&mut connection, fetched),
        Err(_) => Refresh::Failed,
    }
}

// At logout the results go with the session, like the printed identity.
pub fn clear(app: &EngineEnv) -> Result<(), String> {
    clear_on(&open(app)?)
}

pub(crate) fn clear_on(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "DELETE FROM ai_report_cache;
             UPDATE sync_state SET ai_reports_synced_at=NULL, ai_reports_failed=0;",
        )
        .map_err(|_| "Résultats IA locaux non effacés.".to_string())
}

pub fn list(
    app: &EngineEnv,
    patient_id: Option<&str>,
    since: Option<&str>,
) -> Result<Vec<Value>, String> {
    list_on(&open(app)?, patient_id, since)
}

fn parse(payload: &str) -> Result<Value, String> {
    serde_json::from_str(payload).map_err(|_| "Résultat IA local corrompu.".to_string())
}

// Most recent decision first. `since` is an ISO-8601 instant in UTC, compared to
// the decision date as the server wrote it. Only patients that are on the device
// and not locked: a stray row of a patient who left never appears.
pub(crate) fn list_on(
    connection: &Connection,
    patient_id: Option<&str>,
    since: Option<&str>,
) -> Result<Vec<Value>, String> {
    let mut statement = connection
        .prepare(
            "SELECT c.payload, c.fetched_at
             FROM ai_report_cache c
             JOIN patients p ON p.server_id = c.patient_server_id
             WHERE p.locked = 0
               AND (?1 IS NULL OR c.patient_server_id = ?1)
               AND (?2 IS NULL OR c.decided_at >= ?2)
             ORDER BY c.decided_at DESC, c.run_id ASC
             LIMIT ?3",
        )
        .map_err(|_| "Résultats IA locaux indisponibles.".to_string())?;
    let rows = statement
        .query_map(params![patient_id, since, LIST_LIMIT], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|_| "Résultats IA locaux illisibles.".to_string())?;
    let mut reports = Vec::new();
    for row in rows {
        let (payload, fetched_at) = row.map_err(|_| "Résultat IA local illisible.".to_string())?;
        let mut value = parse(&payload)?;
        value["fetchedAt"] = Value::String(fetched_at);
        reports.push(value);
    }
    Ok(reports)
}

pub fn get(app: &EngineEnv, run_id: &str) -> Result<Value, String> {
    get_on(&open(app)?, run_id)
}

pub(crate) fn get_on(connection: &Connection, run_id: &str) -> Result<Value, String> {
    let row: Option<(String, String)> = connection
        .query_row(
            "SELECT c.payload, c.fetched_at
             FROM ai_report_cache c
             JOIN patients p ON p.server_id = c.patient_server_id
             WHERE p.locked = 0 AND c.run_id = ?1",
            params![run_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|_| "Résultat IA local illisible.".to_string())?;
    let (payload, fetched_at) = row.ok_or_else(|| "Résultat IA introuvable.".to_string())?;
    let mut value = parse(&payload)?;
    value["fetchedAt"] = Value::String(fetched_at);
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::{
        lock_patient_for_tests, memory_db_for_tests, purge_clinical_data_for_tests,
        purge_patient_for_tests, schema_for_tests, sync_status_on, upgrade_for_tests,
    };
    use serde_json::json;

    fn add_patient(connection: &Connection, id: &str) {
        connection
            .execute(
                "INSERT INTO patients(server_id, workspace_id, search_text, payload, server_updated_at, last_synced_at)
                 VALUES (?1, 'ws-1', 'a', '{}', '2026-10-28T00:00:00Z', '2026-10-28T00:00:00Z')",
                params![id],
            )
            .unwrap();
    }

    fn report(run_id: &str, patient_id: &str, decided_at: &str) -> Value {
        json!({
            "runId": run_id,
            "patientId": patient_id,
            "pipeline": "brain",
            "moduleLabel": "IRM cérébrale",
            "createdAt": "2026-10-20T08:00:00.000Z",
            "decidedAt": decided_at,
            "decisionStatus": "VALIDATED",
            "decisionLabel": "glioma",
            "decisionLabels": null,
            "clinicianImpression": "Lésion compatible avec un gliome.",
            "modelDecision": "glioma",
            "modelLabels": null,
            "topPredictions": [
                { "label": "glioma", "probability": 0.9 },
                { "label": "meningioma", "probability": 0.05 },
                { "label": "pituitary", "probability": 0.03 },
                { "label": "notumor", "probability": 0.02 }
            ],
            "measures": { "maskAreaRatio": 0.042 },
            "classificationModelId": "brain-effnet",
            "classificationWeightsSha12": "abcdef012345",
            "segmentationModelId": null,
            "segmentationWeightsSha12": null,
            "decidedByName": "Dr Démonstration",
            "reportNumber": "CR-IA-2026-000123",
            "reportSha256": "9".repeat(64)
        })
    }

    fn answer(reports: Vec<Value>) -> Value {
        let ids: Vec<Value> = reports
            .iter()
            .map(|report| report["runId"].clone())
            .collect();
        json!({ "reports": reports, "runIds": ids, "serverTime": "2026-10-30T09:00:00.000Z" })
    }

    fn count(connection: &Connection) -> i64 {
        connection
            .query_row("SELECT COUNT(*) FROM ai_report_cache", [], |row| row.get(0))
            .unwrap()
    }

    #[test]
    fn a_report_is_inserted_then_read_back_with_the_three_predictions_at_most() {
        let mut connection = memory_db_for_tests();
        add_patient(&connection, "p1");
        let stored = apply_on(
            &mut connection,
            &answer(vec![report("r1", "p1", "2026-10-28T09:30:00.000Z")]),
        )
        .unwrap();
        assert_eq!(stored, 1);

        let listed = list_on(&connection, Some("p1"), None).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0]["runId"], "r1");
        assert_eq!(listed[0]["decisionLabel"], "glioma");
        assert_eq!(
            listed[0]["clinicianImpression"],
            "Lésion compatible avec un gliome."
        );
        assert_eq!(listed[0]["measures"]["maskAreaRatio"], 0.042);
        assert_eq!(listed[0]["topPredictions"].as_array().unwrap().len(), 3);
        assert!(listed[0]["fetchedAt"].is_string());

        let one = get_on(&connection, "r1").unwrap();
        assert_eq!(one["reportNumber"], "CR-IA-2026-000123");
        assert!(get_on(&connection, "unknown").is_err());
    }

    #[test]
    fn the_list_is_most_recent_first_and_filtered_by_patient_and_date() {
        let mut connection = memory_db_for_tests();
        add_patient(&connection, "p1");
        add_patient(&connection, "p2");
        apply_on(
            &mut connection,
            &answer(vec![
                report("old", "p1", "2026-10-01T10:00:00.000Z"),
                report("new", "p1", "2026-10-28T10:00:00.000Z"),
                report("other", "p2", "2026-10-20T10:00:00.000Z"),
            ]),
        )
        .unwrap();
        let ids = |reports: Vec<Value>| -> Vec<String> {
            reports
                .iter()
                .map(|r| r["runId"].as_str().unwrap().to_string())
                .collect()
        };
        assert_eq!(
            ids(list_on(&connection, None, None).unwrap()),
            ["new", "other", "old"]
        );
        assert_eq!(
            ids(list_on(&connection, Some("p1"), None).unwrap()),
            ["new", "old"]
        );
        assert_eq!(
            ids(list_on(&connection, None, Some("2026-10-15T00:00:00.000Z")).unwrap()),
            ["new", "other"]
        );
        assert!(list_on(&connection, Some("nobody"), None)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn an_update_replaces_the_report_and_what_run_ids_no_longer_lists_is_removed() {
        let mut connection = memory_db_for_tests();
        add_patient(&connection, "p1");
        apply_on(
            &mut connection,
            &answer(vec![
                report("keep", "p1", "2026-10-20T10:00:00.000Z"),
                report("gone", "p1", "2026-10-21T10:00:00.000Z"),
            ]),
        )
        .unwrap();

        let mut changed = report("keep", "p1", "2026-10-20T10:00:00.000Z");
        changed["clinicianImpression"] = json!("Impression révisée.");
        apply_on(&mut connection, &answer(vec![changed])).unwrap();

        assert_eq!(count(&connection), 1);
        assert_eq!(
            get_on(&connection, "keep").unwrap()["clinicianImpression"],
            "Impression révisée."
        );
        assert!(get_on(&connection, "gone").is_err());

        // An empty answer is a valid answer: nothing is left.
        apply_on(&mut connection, &answer(vec![])).unwrap();
        assert_eq!(count(&connection), 0);
    }

    #[test]
    fn a_malformed_answer_changes_nothing() {
        let mut connection = memory_db_for_tests();
        add_patient(&connection, "p1");
        apply_on(
            &mut connection,
            &answer(vec![report("r1", "p1", "2026-10-20T10:00:00.000Z")]),
        )
        .unwrap();
        assert!(apply_on(&mut connection, &json!({ "reports": [] })).is_err());
        assert!(apply_on(&mut connection, &json!({ "runIds": [] })).is_err());
        assert!(apply_on(&mut connection, &json!("nope")).is_err());
        assert_eq!(count(&connection), 1);
    }

    #[test]
    fn only_the_known_keys_are_kept_and_a_rejected_analysis_never_is() {
        let mut connection = memory_db_for_tests();
        add_patient(&connection, "p1");
        let mut sneaky = report("r1", "p1", "2026-10-20T10:00:00.000Z");
        sneaky["maskPath"] = json!("patients/p1/ai-masks/r1.png");
        sneaky["ttaScores"] = json!([0.1, 0.2]);
        sneaky["decisionReason"] = json!("motif de rejet");
        sneaky["storageKey"] = json!("hx/secret");
        sneaky["measures"]["overlayPath"] = json!("a/b.png");
        let mut rejected = report("r2", "p1", "2026-10-21T10:00:00.000Z");
        rejected["decisionStatus"] = json!("REJECTED");
        apply_on(&mut connection, &answer(vec![sneaky, rejected])).unwrap();

        assert_eq!(count(&connection), 1);
        let stored: String = connection
            .query_row(
                "SELECT payload FROM ai_report_cache WHERE run_id='r1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        for forbidden in [
            "maskPath",
            "ttaScores",
            "decisionReason",
            "storageKey",
            "overlayPath",
            "ai-masks",
        ] {
            assert!(!stored.contains(forbidden), "{forbidden} was stored");
        }
    }

    #[test]
    fn a_patient_who_is_not_on_the_device_or_is_locked_gets_no_row() {
        let mut connection = memory_db_for_tests();
        add_patient(&connection, "p1");
        add_patient(&connection, "locked");
        connection
            .execute("UPDATE patients SET locked=1 WHERE server_id='locked'", [])
            .unwrap();
        apply_on(
            &mut connection,
            &answer(vec![
                report("a", "p1", "2026-10-20T10:00:00.000Z"),
                report("b", "stranger", "2026-10-20T10:00:00.000Z"),
                report("c", "locked", "2026-10-20T10:00:00.000Z"),
            ]),
        )
        .unwrap();
        assert_eq!(count(&connection), 1);
        assert_eq!(list_on(&connection, None, None).unwrap().len(), 1);
    }

    #[test]
    fn a_report_that_run_ids_does_not_list_is_not_taken() {
        let mut connection = memory_db_for_tests();
        add_patient(&connection, "p1");
        let mut response = answer(vec![report("listed", "p1", "2026-10-20T10:00:00.000Z")]);
        response["reports"].as_array_mut().unwrap().push(report(
            "unlisted",
            "p1",
            "2026-10-21T10:00:00.000Z",
        ));
        apply_on(&mut connection, &response).unwrap();
        assert!(get_on(&connection, "listed").is_ok());
        assert!(get_on(&connection, "unlisted").is_err());
    }

    #[test]
    fn the_results_leave_with_their_patient() {
        let mut connection = memory_db_for_tests();
        add_patient(&connection, "p1");
        add_patient(&connection, "p2");
        apply_on(
            &mut connection,
            &answer(vec![
                report("r1", "p1", "2026-10-20T10:00:00.000Z"),
                report("r2", "p2", "2026-10-21T10:00:00.000Z"),
            ]),
        )
        .unwrap();
        purge_patient_for_tests(&mut connection, "p1");
        assert!(get_on(&connection, "r1").is_err());
        assert_eq!(count(&connection), 1);
        assert!(get_on(&connection, "r2").is_ok());
    }

    #[test]
    fn locking_a_patient_hides_and_removes_their_results() {
        let mut connection = memory_db_for_tests();
        add_patient(&connection, "p1");
        apply_on(
            &mut connection,
            &answer(vec![report("r1", "p1", "2026-10-20T10:00:00.000Z")]),
        )
        .unwrap();
        lock_patient_for_tests(&mut connection, "p1");
        assert_eq!(count(&connection), 0);
        assert!(list_on(&connection, None, None).unwrap().is_empty());
    }

    #[test]
    fn a_stray_row_of_a_patient_who_is_gone_is_never_listed() {
        let connection = memory_db_for_tests();
        connection
            .execute(
                "INSERT INTO ai_report_cache(run_id, patient_server_id, pipeline, decided_at, payload, fetched_at)
                 VALUES ('stray', 'gone', 'brain', '2026-10-20T10:00:00.000Z', '{}', '2026-10-20T10:00:00.000Z')",
                [],
            )
            .unwrap();
        assert!(list_on(&connection, None, None).unwrap().is_empty());
        assert!(get_on(&connection, "stray").is_err());
    }

    #[test]
    fn the_results_are_emptied_with_the_clinical_data() {
        let mut connection = memory_db_for_tests();
        add_patient(&connection, "p1");
        apply_on(
            &mut connection,
            &answer(vec![report("r1", "p1", "2026-10-20T10:00:00.000Z")]),
        )
        .unwrap();
        purge_clinical_data_for_tests(&mut connection);
        assert_eq!(count(&connection), 0);
        assert!(sync_status_on(&connection)
            .unwrap()
            .ai_reports_synced_at
            .is_none());
    }

    #[test]
    fn logout_empties_the_results_and_their_state() {
        let mut connection = memory_db_for_tests();
        add_patient(&connection, "p1");
        apply_on(
            &mut connection,
            &answer(vec![report("r1", "p1", "2026-10-20T10:00:00.000Z")]),
        )
        .unwrap();
        mark_failed_on(&connection);
        clear_on(&connection).unwrap();
        assert_eq!(count(&connection), 0);
        let status = sync_status_on(&connection).unwrap();
        assert!(status.ai_reports_synced_at.is_none());
        assert!(!status.ai_reports_failed);
        // The clinical data itself is not what logout empties.
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM patients", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
    }

    #[test]
    fn a_failed_refresh_keeps_the_previous_results_and_only_raises_a_warning() {
        let mut connection = memory_db_for_tests();
        add_patient(&connection, "p1");
        let first = settle_on(
            &mut connection,
            Ok(answer(vec![report("r1", "p1", "2026-10-20T10:00:00.000Z")])),
        );
        assert_eq!(first, Refresh::Updated(1));
        let before = sync_status_on(&connection).unwrap();
        assert!(before.ai_reports_synced_at.is_some());
        assert!(!before.ai_reports_failed);

        // Network failure, a server that answers an error, a garbled answer.
        for failure in [
            Err("Connexion au serveur impossible.".to_string()),
            Err("Erreur serveur 500.".to_string()),
            Ok(json!({ "reports": "oops" })),
        ] {
            assert_eq!(settle_on(&mut connection, failure), Refresh::Failed);
            assert_eq!(count(&connection), 1, "the previous results stay");
            let status = sync_status_on(&connection).unwrap();
            assert!(status.ai_reports_failed);
            // The last good update is still the one displayed.
            assert_eq!(status.ai_reports_synced_at, before.ai_reports_synced_at);
            // The sync state itself is as healthy as before: it is not the sync that failed.
            assert_eq!(status.state, "ONLINE");
        }

        // The next good answer clears the warning.
        assert_eq!(
            settle_on(&mut connection, Ok(answer(vec![]))),
            Refresh::Updated(0)
        );
        assert!(!sync_status_on(&connection).unwrap().ai_reports_failed);
        assert_eq!(count(&connection), 0);
    }

    #[test]
    fn the_new_columns_and_table_are_added_to_an_existing_database_once() {
        // A database of the first release: the schema without the later columns.
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch(schema_for_tests()).unwrap();
        for _ in 0..2 {
            upgrade_for_tests(&connection);
        }
        for column in ["ai_reports_synced_at", "ai_reports_failed"] {
            let present: i64 = connection
                .query_row(
                    "SELECT COUNT(*) FROM pragma_table_info('sync_state') WHERE name = ?1",
                    params![column],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(present, 1, "sync_state.{column}");
        }
        assert_eq!(count(&connection), 0);
        let status = sync_status_on(&connection).unwrap();
        assert!(status.ai_reports_synced_at.is_none());
        assert!(!status.ai_reports_failed);
    }

    // The conclusions are patient health data: they may live in the SQLCipher
    // file and nowhere else. The same operation on a plain file proves the scan
    // would find them.
    #[test]
    fn nothing_of_a_result_is_written_outside_the_encrypted_database() {
        const MARKER: &str = "conclusion-confidentielle-xyzzy";
        fn run(directory: &std::path::Path, encrypted: bool) {
            let mut connection =
                Connection::open(directory.join("healixdz-offline-v1.db")).unwrap();
            if encrypted {
                connection
                    .execute_batch(&format!("PRAGMA key = \"x'{}'\";", "11".repeat(32)))
                    .unwrap();
            }
            connection.execute_batch(schema_for_tests()).unwrap();
            upgrade_for_tests(&connection);
            add_patient(&connection, "p1");
            let mut secret = report("r1", "p1", "2026-10-20T10:00:00.000Z");
            secret["clinicianImpression"] = json!(MARKER);
            apply_on(&mut connection, &answer(vec![secret])).unwrap();
            drop(connection);
        }
        fn files_containing(directory: &std::path::Path, needle: &[u8]) -> Vec<String> {
            let mut found = Vec::new();
            for entry in std::fs::read_dir(directory).unwrap() {
                let path = entry.unwrap().path();
                let bytes = std::fs::read(&path).unwrap();
                if bytes.windows(needle.len()).any(|window| window == needle) {
                    found.push(path.file_name().unwrap().to_string_lossy().to_string());
                }
            }
            found
        }

        let plain =
            std::env::temp_dir().join(format!("healixdz-ai-plain-{}", uuid::Uuid::new_v4()));
        let sealed =
            std::env::temp_dir().join(format!("healixdz-ai-sealed-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&plain).unwrap();
        std::fs::create_dir_all(&sealed).unwrap();
        run(&plain, false);
        run(&sealed, true);

        // The control: an unencrypted file does show the text.
        assert!(!files_containing(&plain, MARKER.as_bytes()).is_empty());
        // The real one does not, in any file of the folder (database, journal, wal).
        assert!(files_containing(&sealed, MARKER.as_bytes()).is_empty());
        for entry in std::fs::read_dir(&sealed).unwrap() {
            let name = entry.unwrap().file_name().to_string_lossy().to_string();
            assert!(
                name.starts_with("healixdz-offline-v1.db"),
                "unexpected file {name}"
            );
        }
        let header = std::fs::read(sealed.join("healixdz-offline-v1.db")).unwrap();
        assert!(!header.starts_with(b"SQLite format 3"));

        let _ = std::fs::remove_dir_all(plain);
        let _ = std::fs::remove_dir_all(sealed);
    }
}
