import { describe, expect, it } from "vitest";
import { bmi, parseVital, VITAL_FIELDS, vitalFlags, vitalsFromForm, vitalsToForm, emptyVitalsForm } from "./vitals";

const field = (key: string) => VITAL_FIELDS.find((item) => item.key === key)!;

describe("bmi", () => {
  it("is weight over height squared, to one decimal", () => {
    expect(bmi(70, 175)).toBe(22.9);
    expect(bmi(82.5, 178)).toBe(26.0);
    expect(bmi(55, 160)).toBe(21.5);
  });

  it("needs both measures", () => {
    expect(bmi(null, 175)).toBeNull();
    expect(bmi(70, undefined)).toBeNull();
    expect(bmi(0, 175)).toBeNull();
  });
});

describe("parseVital", () => {
  it("reads a decimal comma, and an empty field as not measured", () => {
    expect(parseVital(field("temperature"), "37,5")).toEqual({ value: 37.5 });
    expect(parseVital(field("temperature"), " 38.2 ")).toEqual({ value: 38.2 });
    expect(parseVital(field("heartRate"), "")).toEqual({ value: null });
  });

  it("accepts the bounds and refuses what is beyond, in French", () => {
    expect(parseVital(field("systolicBp"), "40").value).toBe(40);
    expect(parseVital(field("systolicBp"), "300").value).toBe(300);
    expect(parseVital(field("systolicBp"), "301").error).toBe("Tension systolique hors limites (40 à 300 mmHg).");
    expect(parseVital(field("systolicBp"), "39").error).toBeDefined();
    expect(parseVital(field("oxygenSaturation"), "100").value).toBe(100);
    expect(parseVital(field("oxygenSaturation"), "100,5").error).toBeDefined();
    expect(parseVital(field("temperature"), "24,9").error).toBe("Température hors limites (25 à 45 °C).");
    expect(parseVital(field("weightKg"), "0").error).toBeDefined();
    expect(parseVital(field("weightKg"), "0,1").value).toBe(0.1);
    expect(parseVital(field("heightCm"), "9").error).toBeDefined();
  });

  it("refuses text and, for the whole-number fields, decimals", () => {
    expect(parseVital(field("heartRate"), "abc").error).toContain("saisissez un nombre");
    expect(parseVital(field("heartRate"), "72,5").error).toContain("entier");
    expect(parseVital(field("heartRate"), "7 2").error).toBeDefined();
    expect(parseVital(field("heartRate"), "1e2").error).toBeDefined();
  });
});

describe("vitalsFromForm / vitalsToForm", () => {
  it("only keeps what was measured, and reports each invalid field", () => {
    const form = { ...emptyVitalsForm(), systolicBp: "120", diastolicBp: "80", temperature: "37,2", heartRate: "900" };
    const { values, errors } = vitalsFromForm(form);
    expect(values).toEqual({ systolicBp: 120, diastolicBp: 80, temperature: 37.2 });
    expect(Object.keys(errors)).toEqual(["heartRate"]);
  });

  it("round-trips, with a decimal comma", () => {
    const form = vitalsToForm({ systolicBp: 135, temperature: 36.8, weightKg: 70.5 });
    expect(form.temperature).toBe("36,8");
    expect(vitalsFromForm(form).values).toEqual({ systolicBp: 135, temperature: 36.8, weightKg: 70.5 });
    expect(vitalsToForm(null)).toEqual(emptyVitalsForm());
  });
});

describe("vitalFlags", () => {
  it("says it in words: raised blood pressure from 140/90, very high from 180/110", () => {
    expect(vitalFlags({ systolicBp: 139, diastolicBp: 89 }).bloodPressure).toBeUndefined();
    expect(vitalFlags({ systolicBp: 140, diastolicBp: 80 }).bloodPressure).toEqual({ level: "attention", text: "Tension élevée" });
    expect(vitalFlags({ systolicBp: 120, diastolicBp: 90 }).bloodPressure?.text).toBe("Tension élevée");
    expect(vitalFlags({ systolicBp: 185, diastolicBp: 100 }).bloodPressure).toEqual({ level: "alert", text: "Tension très élevée" });
    expect(vitalFlags({ systolicBp: 85, diastolicBp: 55 }).bloodPressure?.text).toBe("Tension basse");
  });

  it("oxygen saturation under 94 %, temperature from 38 °C", () => {
    expect(vitalFlags({ oxygenSaturation: 94 }).oxygenSaturation).toBeUndefined();
    expect(vitalFlags({ oxygenSaturation: 93 }).oxygenSaturation).toEqual({ level: "attention", text: "Saturation basse" });
    expect(vitalFlags({ oxygenSaturation: 88 }).oxygenSaturation?.level).toBe("alert");
    expect(vitalFlags({ temperature: 37.9 }).temperature).toBeUndefined();
    expect(vitalFlags({ temperature: 38 }).temperature).toEqual({ level: "attention", text: "Fièvre" });
    expect(vitalFlags({ temperature: 39.6 }).temperature?.level).toBe("alert");
    expect(vitalFlags({ temperature: 34.5 }).temperature?.text).toBe("Hypothermie");
  });

  it("heart rate, respiratory rate and BMI", () => {
    expect(vitalFlags({ heartRate: 72 }).heartRate).toBeUndefined();
    expect(vitalFlags({ heartRate: 101 }).heartRate?.text).toBe("Tachycardie");
    expect(vitalFlags({ heartRate: 55 }).heartRate?.text).toBe("Bradycardie");
    expect(vitalFlags({ respiratoryRate: 24 }).respiratoryRate?.text).toBe("Fréquence élevée");
    expect(vitalFlags({ weightKg: 70, heightCm: 175 }).bmi).toBeUndefined();
    expect(vitalFlags({ weightKg: 82.5, heightCm: 178 }).bmi?.text).toBe("Surpoids");
    expect(vitalFlags({ weightKg: 100, heightCm: 170 }).bmi?.text).toBe("Obésité");
    expect(vitalFlags({ weightKg: 45, heightCm: 175 }).bmi?.text).toBe("Insuffisance pondérale");
  });

  it("flags nothing for normal or missing values", () => {
    expect(vitalFlags({})).toEqual({});
    expect(vitalFlags({ systolicBp: 120, diastolicBp: 80, heartRate: 72, respiratoryRate: 16, oxygenSaturation: 98, temperature: 36.8 })).toEqual({});
  });
});
