// The clinical content of a local consultation draft: vital signs, diagnoses,
// the appointment link. Validation and merge rules only; no database here.
//
// What the server accepts (SyncConsultationPayloadDto, UpdateConsultationDto):
//   - the same bounds as below, and NO unknown field (forbidNonWhitelisted);
//   - on an UPDATE, a key that is absent leaves the server value alone, `null`
//     (vital signs) or `[]` (diagnoses) DELETES it.
//
// So the draft never invents `null` / `[]`. Each of the three fields has an
// explicit three-state meaning (`Patch`):
//   Untouched  the interface did not touch it: the value already stored is
//              kept, whether it came from the server by synchronization or
//              from an earlier local save;
//   Clear      the doctor removed it on purpose;
//   Set(v)     the doctor entered it.
// A consultation completed on the web and edited here only on its reason
// therefore keeps its vital signs and diagnoses, in the operation as well.
//
// The value stored is always in the shape of the server DTO (no id, no
// timestamp: the server refuses them), which is also what is sent.

use serde::{Deserialize, Deserializer};
use serde_json::{json, Map, Value};

#[derive(Debug, Clone, PartialEq)]
pub enum Patch<T> {
    Untouched,
    Clear,
    Set(T),
}

// No bound on T: an absent key is Untouched whatever the value type (a derived
// Default would require `T: Default`).
#[allow(clippy::derivable_impls)]
impl<T> Default for Patch<T> {
    fn default() -> Self {
        Patch::Untouched
    }
}

// Called only when the key is present: `null` clears, a value sets. An absent
// key never reaches this function and takes the `Default` (Untouched).
impl<'de, T: Deserialize<'de>> Deserialize<'de> for Patch<T> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Ok(match Option::<T>::deserialize(deserializer)? {
            Some(value) => Patch::Set(value),
            None => Patch::Clear,
        })
    }
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VitalSignsInput {
    #[serde(default)]
    pub systolic_bp: Option<i64>,
    #[serde(default)]
    pub diastolic_bp: Option<i64>,
    #[serde(default)]
    pub heart_rate: Option<i64>,
    #[serde(default)]
    pub respiratory_rate: Option<i64>,
    #[serde(default)]
    pub oxygen_saturation: Option<f64>,
    #[serde(default)]
    pub temperature: Option<f64>,
    #[serde(default)]
    pub weight_kg: Option<f64>,
    #[serde(default)]
    pub height_cm: Option<f64>,
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosisInput {
    pub label: String,
    #[serde(default)]
    pub code: Option<String>,
    #[serde(default)]
    pub code_system: Option<String>,
    #[serde(default)]
    pub is_primary: bool,
    #[serde(default)]
    pub note: Option<String>,
}

pub const MAX_DIAGNOSES: usize = 20;

// Server limits (class-validator MaxLength counts UTF-16 code units).
const LABEL_MAX: usize = 500;
const CODE_MAX: usize = 80;
const NOTE_MAX: usize = 5_000;

fn units(value: &str) -> usize {
    value.encode_utf16().count()
}

// (key, label, minimum, maximum, integer)
const BOUNDS: [(&str, &str, f64, f64, bool); 8] = [
    ("systolicBp", "Tension systolique", 40.0, 300.0, true),
    ("diastolicBp", "Tension diastolique", 20.0, 200.0, true),
    ("heartRate", "Fréquence cardiaque", 20.0, 300.0, true),
    (
        "respiratoryRate",
        "Fréquence respiratoire",
        5.0,
        100.0,
        true,
    ),
    (
        "oxygenSaturation",
        "Saturation en oxygène",
        0.0,
        100.0,
        false,
    ),
    ("temperature", "Température", 25.0, 45.0, false),
    ("weightKg", "Poids", 0.1, 700.0, false),
    ("heightCm", "Taille", 10.0, 300.0, false),
];

fn number(value: f64) -> Value {
    // Whole numbers travel as integers (the server validates IsInt on four
    // fields); the others keep their decimals.
    if value.fract() == 0.0 && value.abs() < 1e15 {
        json!(value as i64)
    } else {
        json!(value)
    }
}

// The vital signs of a doctor's entry, checked against the server bounds. An
// entry with no value at all is `Null` (nothing to store, nothing to send).
pub fn validate_vitals(input: &VitalSignsInput) -> Result<Value, String> {
    let entered: [Option<f64>; 8] = [
        input.systolic_bp.map(|v| v as f64),
        input.diastolic_bp.map(|v| v as f64),
        input.heart_rate.map(|v| v as f64),
        input.respiratory_rate.map(|v| v as f64),
        input.oxygen_saturation,
        input.temperature,
        input.weight_kg,
        input.height_cm,
    ];
    let mut object = Map::new();
    for (value, (key, label, min, max, _)) in entered.iter().zip(BOUNDS) {
        let Some(value) = value else { continue };
        if !value.is_finite() || *value < min || *value > max {
            return Err(format!(
                "{label} hors limites ({} à {}).",
                number(min),
                number(max)
            ));
        }
        object.insert(key.to_string(), number(*value));
    }
    Ok(if object.is_empty() {
        Value::Null
    } else {
        Value::Object(object)
    })
}

// A stored value (possibly a server snapshot with ids and timestamps) in the
// shape of the DTO. Unknown or null fields are dropped; stored data is trusted
// and not re-validated (the server already accepted it).
pub fn normalize_vitals(stored: &Value) -> Value {
    let Some(source) = stored.as_object() else {
        return Value::Null;
    };
    let mut object = Map::new();
    for (key, _, _, _, integer) in BOUNDS {
        let value = source.get(key).and_then(|value| {
            if integer {
                value.as_i64().map(Value::from)
            } else {
                value.as_f64().map(number)
            }
        });
        if let Some(value) = value {
            object.insert(key.to_string(), value);
        }
    }
    if object.is_empty() {
        Value::Null
    } else {
        Value::Object(object)
    }
}

fn optional(value: &Option<String>, label: &str, max: usize) -> Result<Option<String>, String> {
    match value.as_deref().map(str::trim) {
        None | Some("") => Ok(None),
        Some(text) if units(text) > max => {
            Err(format!("{label} trop long ({max} caractères au maximum)."))
        }
        Some(text) => Ok(Some(text.to_string())),
    }
}

// The diagnoses of a doctor's entry: 1 to 500 characters of label, at most 20
// of them, at most one primary.
pub fn validate_diagnoses(input: &[DiagnosisInput]) -> Result<Value, String> {
    if input.len() > MAX_DIAGNOSES {
        return Err(format!("{MAX_DIAGNOSES} diagnostics au maximum."));
    }
    if input
        .iter()
        .filter(|diagnosis| diagnosis.is_primary)
        .count()
        > 1
    {
        return Err("Un seul diagnostic peut être le diagnostic principal.".to_string());
    }
    let mut list = Vec::with_capacity(input.len());
    for diagnosis in input {
        let label = diagnosis.label.trim();
        if label.is_empty() {
            return Err("Chaque diagnostic doit avoir un libellé.".to_string());
        }
        if units(label) > LABEL_MAX {
            return Err(format!(
                "Libellé de diagnostic trop long ({LABEL_MAX} caractères au maximum)."
            ));
        }
        let mut object = Map::new();
        object.insert("label".to_string(), json!(label));
        if let Some(code) = optional(&diagnosis.code, "Code du diagnostic", CODE_MAX)? {
            object.insert("code".to_string(), json!(code));
        }
        if let Some(system) = optional(&diagnosis.code_system, "Système de codage", CODE_MAX)? {
            object.insert("codeSystem".to_string(), json!(system));
        }
        object.insert("isPrimary".to_string(), json!(diagnosis.is_primary));
        if let Some(note) = optional(&diagnosis.note, "Note du diagnostic", NOTE_MAX)? {
            object.insert("note".to_string(), json!(note));
        }
        list.push(Value::Object(object));
    }
    Ok(Value::Array(list))
}

// Stored diagnoses (a server snapshot carries id, consultationId, createdAt)
// in the shape of the DTO.
pub fn normalize_diagnoses(stored: &Value) -> Value {
    let list = stored.as_array().map(Vec::as_slice).unwrap_or(&[]);
    Value::Array(
        list.iter()
            .filter_map(|diagnosis| {
                let label = diagnosis.get("label")?.as_str()?.trim();
                if label.is_empty() {
                    return None;
                }
                let mut object = Map::new();
                object.insert("label".to_string(), json!(label));
                for key in ["code", "codeSystem", "note"] {
                    if let Some(text) = diagnosis.get(key).and_then(Value::as_str) {
                        if !text.trim().is_empty() {
                            object.insert(key.to_string(), json!(text.trim()));
                        }
                    }
                }
                object.insert(
                    "isPrimary".to_string(),
                    json!(diagnosis
                        .get("isPrimary")
                        .and_then(Value::as_bool)
                        .unwrap_or(false)),
                );
                Some(Value::Object(object))
            })
            .collect(),
    )
}

pub struct Resolved {
    pub vital_signs: Value,
    pub diagnoses: Value,
    pub appointment_id: Option<String>,
}

// The three fields of the operation, from the doctor's input and what is
// already stored for this consultation (`None` for a new one).
pub fn resolve(
    vital_signs: &Patch<VitalSignsInput>,
    diagnoses: &Patch<Vec<DiagnosisInput>>,
    appointment_id: Option<&str>,
    stored: Option<&Value>,
) -> Result<Resolved, String> {
    let known = |key: &str| stored.and_then(|payload| payload.get(key));
    Ok(Resolved {
        vital_signs: match vital_signs {
            Patch::Untouched => known("vitalSigns")
                .map(normalize_vitals)
                .unwrap_or(Value::Null),
            Patch::Clear => Value::Null,
            Patch::Set(input) => validate_vitals(input)?,
        },
        diagnoses: match diagnoses {
            Patch::Untouched => known("diagnoses")
                .map(normalize_diagnoses)
                .unwrap_or_else(|| Value::Array(Vec::new())),
            Patch::Clear => Value::Array(Vec::new()),
            Patch::Set(list) => validate_diagnoses(list)?,
        },
        // The desktop never unlinks an appointment: no value means "keep".
        appointment_id: appointment_id.map(str::to_string).or_else(|| {
            known("appointmentId")
                .and_then(Value::as_str)
                .map(str::to_string)
        }),
    })
}

fn text_units(payload: &Value, key: &str) -> usize {
    payload
        .get(key)
        .and_then(Value::as_str)
        .map(units)
        .unwrap_or(0)
}

// Limits of the free-text fields (the server refuses a longer one, and a
// refused operation would end up as a conflict).
pub fn validate_texts(payload: &Value) -> Result<(), String> {
    for (key, label, max) in [
        ("chiefComplaint", "Motif", 5_000),
        ("historyPresentIllness", "Histoire de la maladie", 10_000),
        ("clinicalExamination", "Examen clinique", 10_000),
        ("assessment", "Évaluation", 10_000),
        ("carePlan", "Plan thérapeutique", 10_000),
        ("followUpPlan", "Suivi", 5_000),
    ] {
        if text_units(payload, key) > max {
            return Err(format!("{label} trop long ({max} caractères au maximum)."));
        }
    }
    Ok(())
}

// What the server requires of a finished consultation
// (SyncService.hasClinicalContent).
pub fn has_clinical_content(payload: &Value) -> bool {
    let filled = |key: &str| {
        payload
            .get(key)
            .and_then(Value::as_str)
            .is_some_and(|text| !text.trim().is_empty())
    };
    filled("chiefComplaint")
        || filled("assessment")
        || filled("clinicalExamination")
        || payload
            .get("diagnoses")
            .and_then(Value::as_array)
            .is_some_and(|list| !list.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn patch<T: for<'a> Deserialize<'a>>(raw: &str) -> Patch<T> {
        #[derive(Deserialize)]
        #[serde(bound(deserialize = "T: Deserialize<'de>"))]
        struct Holder<T> {
            #[serde(default)]
            field: Patch<T>,
        }
        serde_json::from_str::<Holder<T>>(raw)
            .expect("holder")
            .field
    }

    #[test]
    fn a_missing_key_is_untouched_null_clears_and_a_value_sets() {
        assert_eq!(patch::<VitalSignsInput>("{}"), Patch::Untouched);
        assert_eq!(patch::<VitalSignsInput>(r#"{"field":null}"#), Patch::Clear);
        assert_eq!(
            patch::<VitalSignsInput>(r#"{"field":{"heartRate":72}}"#),
            Patch::Set(VitalSignsInput {
                heart_rate: Some(72),
                ..Default::default()
            })
        );
        assert_eq!(patch::<Vec<DiagnosisInput>>("{}"), Patch::Untouched);
        assert_eq!(
            patch::<Vec<DiagnosisInput>>(r#"{"field":null}"#),
            Patch::Clear
        );
        assert_eq!(
            patch::<Vec<DiagnosisInput>>(r#"{"field":[]}"#),
            Patch::Set(vec![])
        );
    }

    #[test]
    fn vitals_are_normalized_to_the_dto_shape() {
        let value = validate_vitals(&VitalSignsInput {
            systolic_bp: Some(120),
            diastolic_bp: Some(80),
            temperature: Some(37.5),
            weight_kg: Some(70.0),
            ..Default::default()
        })
        .unwrap();
        assert_eq!(
            value,
            json!({ "systolicBp": 120, "diastolicBp": 80, "temperature": 37.5, "weightKg": 70 })
        );
        assert_eq!(
            validate_vitals(&VitalSignsInput::default()).unwrap(),
            Value::Null
        );
    }

    #[test]
    fn every_vital_sign_is_held_to_the_server_bounds() {
        let at = |mutate: fn(&mut VitalSignsInput)| {
            let mut input = VitalSignsInput::default();
            mutate(&mut input);
            validate_vitals(&input)
        };
        // Both edges are accepted, one beyond is refused.
        assert!(at(|v| v.systolic_bp = Some(40)).is_ok());
        assert!(at(|v| v.systolic_bp = Some(300)).is_ok());
        assert!(at(|v| v.systolic_bp = Some(39)).is_err());
        assert!(at(|v| v.systolic_bp = Some(301)).is_err());
        assert!(at(|v| v.diastolic_bp = Some(19)).is_err());
        assert!(at(|v| v.diastolic_bp = Some(201)).is_err());
        assert!(at(|v| v.heart_rate = Some(19)).is_err());
        assert!(at(|v| v.heart_rate = Some(301)).is_err());
        assert!(at(|v| v.respiratory_rate = Some(4)).is_err());
        assert!(at(|v| v.respiratory_rate = Some(101)).is_err());
        assert!(at(|v| v.oxygen_saturation = Some(-0.1)).is_err());
        assert!(at(|v| v.oxygen_saturation = Some(100.1)).is_err());
        assert!(at(|v| v.oxygen_saturation = Some(100.0)).is_ok());
        assert!(at(|v| v.temperature = Some(24.9)).is_err());
        assert!(at(|v| v.temperature = Some(45.1)).is_err());
        assert!(at(|v| v.weight_kg = Some(0.0)).is_err());
        assert!(at(|v| v.weight_kg = Some(700.1)).is_err());
        assert!(at(|v| v.height_cm = Some(9.9)).is_err());
        assert!(at(|v| v.height_cm = Some(300.1)).is_err());
        assert!(at(|v| v.temperature = Some(f64::NAN)).is_err());
        let message = at(|v| v.systolic_bp = Some(500)).unwrap_err();
        assert_eq!(message, "Tension systolique hors limites (40 à 300).");
    }

    #[test]
    fn stored_vitals_lose_ids_timestamps_and_nulls() {
        let server = json!({
            "id": "v1", "consultationId": "c1", "createdAt": "2026-10-28T10:00:00.000Z", "updatedAt": "2026-10-28T10:00:00.000Z",
            "systolicBp": 130, "diastolicBp": 85, "heartRate": null, "respiratoryRate": null,
            "oxygenSaturation": 97.5, "temperature": 37.0, "weightKg": 82.4, "heightCm": null
        });
        assert_eq!(
            normalize_vitals(&server),
            json!({ "systolicBp": 130, "diastolicBp": 85, "oxygenSaturation": 97.5, "temperature": 37, "weightKg": 82.4 })
        );
        assert_eq!(normalize_vitals(&Value::Null), Value::Null);
        assert_eq!(
            normalize_vitals(&json!({ "id": "only-metadata" })),
            Value::Null
        );
    }

    fn diagnosis(label: &str, primary: bool) -> DiagnosisInput {
        DiagnosisInput {
            label: label.to_string(),
            is_primary: primary,
            ..Default::default()
        }
    }

    #[test]
    fn at_most_one_primary_diagnosis_and_twenty_diagnoses() {
        assert!(validate_diagnoses(&[diagnosis("A", true), diagnosis("B", false)]).is_ok());
        assert!(validate_diagnoses(&[diagnosis("A", false), diagnosis("B", false)]).is_ok());
        assert_eq!(
            validate_diagnoses(&[diagnosis("A", true), diagnosis("B", true)]).unwrap_err(),
            "Un seul diagnostic peut être le diagnostic principal."
        );
        let twenty: Vec<_> = (0..20)
            .map(|i| diagnosis(&format!("D{i}"), false))
            .collect();
        assert!(validate_diagnoses(&twenty).is_ok());
        let twenty_one: Vec<_> = (0..21)
            .map(|i| diagnosis(&format!("D{i}"), false))
            .collect();
        assert!(validate_diagnoses(&twenty_one).is_err());
    }

    #[test]
    fn diagnosis_fields_are_bounded_trimmed_and_shaped_like_the_dto() {
        assert!(validate_diagnoses(&[diagnosis("   ", false)]).is_err());
        assert!(validate_diagnoses(&[diagnosis(&"x".repeat(500), false)]).is_ok());
        assert!(validate_diagnoses(&[diagnosis(&"x".repeat(501), false)]).is_err());
        let long_code = DiagnosisInput {
            code: Some("c".repeat(81)),
            ..diagnosis("A", false)
        };
        assert!(validate_diagnoses(&[long_code]).is_err());
        let long_note = DiagnosisInput {
            note: Some("n".repeat(5_001)),
            ..diagnosis("A", false)
        };
        assert!(validate_diagnoses(&[long_note]).is_err());

        let full = DiagnosisInput {
            label: "  Hypertension artérielle ".to_string(),
            code: Some(" I10 ".to_string()),
            code_system: Some("CIM-10".to_string()),
            is_primary: true,
            note: Some("   ".to_string()),
        };
        assert_eq!(
            validate_diagnoses(&[full]).unwrap(),
            json!([{ "label": "Hypertension artérielle", "code": "I10", "codeSystem": "CIM-10", "isPrimary": true }])
        );
    }

    #[test]
    fn stored_diagnoses_lose_ids_and_timestamps() {
        let server = json!([
            { "id": "d1", "consultationId": "c1", "label": "Bronchite", "code": null, "codeSystem": null, "isPrimary": true, "note": null, "createdAt": "2026-10-28T10:00:00.000Z" },
            { "id": "d2", "consultationId": "c1", "label": "Rhinite", "code": "J30", "isPrimary": false, "note": "saisonnière", "createdAt": "2026-10-28T10:00:01.000Z" },
            { "label": "  " }
        ]);
        assert_eq!(
            normalize_diagnoses(&server),
            json!([
                { "label": "Bronchite", "isPrimary": true },
                { "label": "Rhinite", "code": "J30", "note": "saisonnière", "isPrimary": false }
            ])
        );
        assert_eq!(normalize_diagnoses(&Value::Null), json!([]));
    }

    #[test]
    fn untouched_keeps_what_is_stored_and_never_invents_null_or_empty() {
        let stored = json!({
            "appointmentId": "a1",
            "vitalSigns": { "id": "v1", "heartRate": 72, "createdAt": "x" },
            "diagnoses": [{ "id": "d1", "label": "Bronchite", "isPrimary": true, "createdAt": "x" }]
        });
        let kept = resolve(&Patch::Untouched, &Patch::Untouched, None, Some(&stored)).unwrap();
        assert_eq!(kept.vital_signs, json!({ "heartRate": 72 }));
        assert_eq!(
            kept.diagnoses,
            json!([{ "label": "Bronchite", "isPrimary": true }])
        );
        assert_eq!(kept.appointment_id.as_deref(), Some("a1"));

        // Clear removes on purpose; Set replaces.
        let cleared = resolve(&Patch::Clear, &Patch::Clear, None, Some(&stored)).unwrap();
        assert_eq!(cleared.vital_signs, Value::Null);
        assert_eq!(cleared.diagnoses, json!([]));
        let set = resolve(
            &Patch::Set(VitalSignsInput {
                heart_rate: Some(90),
                ..Default::default()
            }),
            &Patch::Set(vec![diagnosis("Angine", true)]),
            Some("a2"),
            Some(&stored),
        )
        .unwrap();
        assert_eq!(set.vital_signs, json!({ "heartRate": 90 }));
        assert_eq!(
            set.diagnoses,
            json!([{ "label": "Angine", "isPrimary": true }])
        );
        assert_eq!(set.appointment_id.as_deref(), Some("a2"));

        // A new consultation has nothing stored.
        let fresh = resolve(&Patch::Untouched, &Patch::Untouched, None, None).unwrap();
        assert_eq!(fresh.vital_signs, Value::Null);
        assert_eq!(fresh.diagnoses, json!([]));
        assert_eq!(fresh.appointment_id, None);
    }

    #[test]
    fn a_finished_consultation_needs_clinical_content_like_on_the_server() {
        assert!(!has_clinical_content(
            &json!({ "chiefComplaint": "  ", "diagnoses": [] })
        ));
        assert!(has_clinical_content(&json!({ "chiefComplaint": "Toux" })));
        assert!(has_clinical_content(&json!({ "assessment": "x" })));
        assert!(has_clinical_content(&json!({ "clinicalExamination": "x" })));
        assert!(has_clinical_content(
            &json!({ "diagnoses": [{ "label": "A" }] })
        ));
        // The history, the plan and the vitals alone do not count.
        assert!(!has_clinical_content(
            &json!({ "historyPresentIllness": "x", "carePlan": "y", "vitalSigns": { "heartRate": 70 } })
        ));
    }

    #[test]
    fn free_text_is_held_to_the_server_limits() {
        assert!(validate_texts(&json!({ "chiefComplaint": "x".repeat(5_000) })).is_ok());
        assert!(validate_texts(&json!({ "chiefComplaint": "x".repeat(5_001) })).is_err());
        assert!(validate_texts(&json!({ "assessment": "x".repeat(10_001) })).is_err());
        assert!(validate_texts(&json!({ "followUpPlan": "x".repeat(5_001) })).is_err());
    }
}
