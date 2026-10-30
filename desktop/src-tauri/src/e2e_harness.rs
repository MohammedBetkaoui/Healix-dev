// Offline reliability harness: the real desktop engine (SQLCipher storage,
// device identity, proof-of-possession signatures, outbox, sync_now) driven
// from a command line, one process per command. A test runs a command, kills
// the process at a crash point or restarts it on the same profile, and reads
// the local database back with `dump`.
//
// A profile is a folder: `data/` holds the encrypted database, `vault/` the
// secrets that the OS credential vault holds in the shipped application (see
// security.rs: the file vault exists only in builds with this feature).
// Everything a command prints is one JSON line on stdout:
//   {"ok":true,"result":...}  or  {"ok":false,"error":"..."}
// Only synthetic test data goes through it; no secret is ever printed.

use rusqlite::{types::ValueRef, Connection};
use serde_json::{json, Map, Value};
use std::{collections::HashMap, path::PathBuf};

use crate::{authorize, database, network, security};
use database::EngineEnv;

struct Flags(HashMap<String, String>);

impl Flags {
    fn parse(args: &[String]) -> Result<Self, String> {
        let mut flags = HashMap::new();
        let mut iter = args.iter();
        while let Some(name) = iter.next() {
            let name = name
                .strip_prefix("--")
                .ok_or_else(|| format!("Argument inattendu: {name}"))?;
            let value = iter
                .next()
                .ok_or_else(|| format!("Valeur manquante pour --{name}"))?;
            flags.insert(name.to_string(), value.clone());
        }
        Ok(Self(flags))
    }

    fn require(&self, name: &str) -> Result<&str, String> {
        self.0
            .get(name)
            .map(String::as_str)
            .ok_or_else(|| format!("--{name} requis"))
    }

    fn optional(&self, name: &str) -> &str {
        self.0.get(name).map(String::as_str).unwrap_or("")
    }

    fn input<T: serde::de::DeserializeOwned>(&self) -> Result<T, String> {
        serde_json::from_str(self.require("input")?).map_err(|e| format!("--input invalide: {e}"))
    }
}

pub fn run(args: Vec<String>) -> i32 {
    match execute(&args) {
        Ok(result) => {
            println!("{}", json!({ "ok": true, "result": result }));
            0
        }
        Err(error) => {
            println!("{}", json!({ "ok": false, "error": error }));
            1
        }
    }
}

fn to_value<T: serde::Serialize>(value: T) -> Result<Value, String> {
    serde_json::to_value(value).map_err(|_| "Résultat illisible.".to_string())
}

fn execute(args: &[String]) -> Result<Value, String> {
    let (command, rest) = args
        .split_first()
        .ok_or_else(|| "Commande requise".to_string())?;
    let flags = Flags::parse(rest)?;
    let profile = PathBuf::from(flags.require("profile")?);
    // Before any secret is read: the vault of this profile.
    std::env::set_var("HEALIX_E2E_SECRET_DIR", profile.join("vault"));
    let env = EngineEnv::from_dir(profile.join("data"));

    match command.as_str() {
        "register" => block_on(async {
            // Optional: an RSA identity generated beforehand. Generating a
            // 2048-bit key takes seconds in a debug build and is not what a
            // scenario is about; registration, grant and signatures stay real.
            if let Some(path) = flags.0.get("device-key-file") {
                if security::get_secret("device-private-key").is_err() {
                    let pem = std::fs::read_to_string(path)
                        .map_err(|_| "Clé d’appareil de test illisible.".to_string())?;
                    security::set_secret("device-private-key", &pem)?;
                }
            }
            let status =
                network::login_register_and_bootstrap(&env, flags.require("api")?, flags.input()?)
                    .await?;
            to_value(status)
        }),
        "session" => {
            let (_, claims) = authorize(&env)?;
            to_value(database::session_status(&env, Some(&claims))?)
        }
        "sync" => block_on(async {
            let (grant, claims) = authorize(&env)?;
            to_value(network::sync_now(&env, flags.require("api")?, &grant, &claims).await?)
        }),
        // Several sync_now() at once in this one process, as the application
        // would run two invocations of its sync command side by side.
        "sync-concurrent" => {
            let (grant, claims) = authorize(&env)?;
            let api = flags.require("api")?;
            let count: usize = flags.optional("count").parse().unwrap_or(2);
            let outcomes: Vec<Value> = std::thread::scope(|scope| {
                let handles: Vec<_> = (0..count)
                    .map(|_| {
                        scope.spawn(|| {
                            block_on(async {
                                to_value(network::sync_now(&env, api, &grant, &claims).await?)
                            })
                        })
                    })
                    .collect();
                handles
                    .into_iter()
                    .map(|handle| match handle.join() {
                        Ok(Ok(result)) => json!({ "ok": true, "result": result }),
                        Ok(Err(error)) => json!({ "ok": false, "error": error }),
                        Err(_) => json!({ "ok": false, "error": "panic" }),
                    })
                    .collect()
            });
            Ok(Value::Array(outcomes))
        }
        "save-consultation" => {
            let (_, claims) = authorize(&env)?;
            to_value(database::save_draft(&env, &claims, flags.input()?)?)
        }
        "save-prescription" => {
            let (_, claims) = authorize(&env)?;
            to_value(database::save_prescription_draft(
                &env,
                &claims,
                flags.input()?,
            )?)
        }
        "status" => {
            authorize(&env)?;
            to_value(database::sync_status(&env)?)
        }
        "patients" => {
            authorize(&env)?;
            Ok(Value::Array(database::list_patients(
                &env,
                flags.optional("query"),
            )?))
        }
        "prescriptions" => {
            authorize(&env)?;
            Ok(Value::Array(database::list_patient_prescriptions(
                &env,
                flags.require("patient")?,
            )?))
        }
        "prescription" => {
            authorize(&env)?;
            database::get_local_prescription(&env, flags.require("id")?)
        }
        "medications" => {
            authorize(&env)?;
            Ok(Value::Array(database::search_local_medications(
                &env,
                flags.optional("query"),
            )?))
        }
        "logout" => {
            security::clear_session();
            Ok(Value::Null)
        }
        // Reads the SQLCipher database as it is on disk: no authorization,
        // so it also works on a device whose grant was cleared or revoked.
        "dump" => dump(&database::open(&env)?),
        other => Err(format!("Commande inconnue: {other}")),
    }
}

fn block_on<T>(future: impl std::future::Future<Output = Result<T, String>>) -> Result<T, String> {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|_| "Runtime indisponible.".to_string())?
        .block_on(future)
}

fn table(connection: &Connection, sql: &str) -> Result<Vec<Value>, String> {
    let mut statement = connection
        .prepare(sql)
        .map_err(|error| format!("dump: {error}"))?;
    let names: Vec<String> = statement
        .column_names()
        .iter()
        .map(|name| name.to_string())
        .collect();
    let rows = statement
        .query_map([], |row| {
            let mut object = Map::new();
            for (index, name) in names.iter().enumerate() {
                let value = match row.get_ref(index)? {
                    ValueRef::Null | ValueRef::Blob(_) => Value::Null,
                    ValueRef::Integer(number) => json!(number),
                    ValueRef::Real(number) => json!(number),
                    ValueRef::Text(text) => {
                        Value::String(String::from_utf8_lossy(text).into_owned())
                    }
                };
                object.insert(name.clone(), value);
            }
            Ok(Value::Object(object))
        })
        .map_err(|error| format!("dump: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("dump: {error}"))
}

fn dump(connection: &Connection) -> Result<Value, String> {
    let cipher = table(connection, "PRAGMA cipher_version")?;
    Ok(json!({
        "cipherVersion": cipher.first().and_then(|row| row.get("cipher_version")).cloned(),
        "user": table(connection, "SELECT id, full_name, email, role FROM local_user")?,
        "workspace": table(connection, "SELECT id, name, workspace_type FROM local_workspace")?,
        "device": table(connection, "SELECT id, workspace_id FROM local_device")?,
        "patients": table(connection, "SELECT server_id, workspace_id, locked, lock_reason FROM patients ORDER BY server_id")?,
        "appointments": table(connection, "SELECT server_id, patient_server_id FROM appointments_cache ORDER BY server_id")?,
        "medicationCount": table(connection, "SELECT COUNT(*) AS count FROM medication_reference_cache")?,
        "consultations": table(connection, "SELECT * FROM consultations ORDER BY updated_at, local_id")?,
        "prescriptions": table(connection, "SELECT * FROM prescription_drafts ORDER BY updated_at, local_id")?,
        "prescriptionItems": table(connection, "SELECT prescription_local_id, position, payload FROM prescription_items ORDER BY prescription_local_id, position")?,
        "outbox": table(connection, "SELECT * FROM sync_outbox ORDER BY sequence")?,
        "entityMap": table(connection, "SELECT entity_type, local_entity_id, server_entity_id FROM sync_entity_map ORDER BY entity_type, local_entity_id")?,
        "conflicts": table(connection, "SELECT * FROM sync_conflicts ORDER BY detected_at, id")?,
        "syncState": table(connection, "SELECT cursor, last_synced_at FROM sync_state")?,
        "audit": table(connection, "SELECT action, entity_id, synced_at FROM local_audit_events ORDER BY occurred_at, id")?,
    }))
}
