import { describe, expect, it } from "vitest";
import {
  addDiagnosis, formFromDetail, hasClinicalContent, inputFromForm, MAX_DIAGNOSES, newForm, removeDiagnosis,
  setPrimaryDiagnosis, type ConsultationForm,
} from "./consultation-form";
import { consultationDetail } from "./test/fixtures";

const input = (form: ConsultationForm, ...args: Parameters<typeof inputFromForm> extends [unknown, ...infer R] ? R : never) => {
  const built = inputFromForm(form, ...args);
  if ("problems" in built) throw new Error(`unexpected problems: ${built.problems.messages.join(" | ")}`);
  return built.input;
};

describe("the request sent for a consultation", () => {
  it("leaves the vital signs and the diagnoses out until the doctor touches them", () => {
    const sent = input({ ...newForm("p1"), chiefComplaint: "Toux" });
    expect("vitalSigns" in sent).toBe(false);
    expect("diagnoses" in sent).toBe(false);
    expect("appointmentId" in sent).toBe(false);
  });

  it("carries the appointment it was started from", () => {
    expect(input(newForm("p1", { appointmentId: "a1", reason: "Toux" })).appointmentId).toBe("a1");
  });

  it("sends the vital signs the doctor entered, as numbers", () => {
    const form = { ...newForm("p1"), vitalsTouched: true, vitals: { ...newForm("p1").vitals, systolicBp: "150", temperature: "37,5" } };
    expect(input(form).vitalSigns).toEqual({ systolicBp: 150, temperature: 37.5 });
  });

  it("sends an empty entry as an empty object: the native side reads it as 'no vital signs'", () => {
    const form = { ...formFromDetail(consultationDetail({ vitalSigns: { heartRate: 80 } })), vitalsTouched: true };
    form.vitals = { ...form.vitals, heartRate: "" };
    expect(input(form).vitalSigns).toEqual({});
  });

  it("refuses an out-of-bounds vital sign on purpose, but not while saving automatically", () => {
    const form = { ...newForm("p1"), chiefComplaint: "Toux", vitalsTouched: true, vitals: { ...newForm("p1").vitals, systolicBp: "500" } };
    const strict = inputFromForm(form);
    expect("problems" in strict && strict.problems.messages[0]).toBe("Tension systolique hors limites (40 à 300 mmHg).");
    // Automatic save: the rest is saved, the vital signs being typed are left out.
    const lenient = input(form, undefined, { lenient: true });
    expect(lenient.chiefComplaint).toBe("Toux");
    expect("vitalSigns" in lenient).toBe(false);
  });

  it("sends the diagnoses with their code system, without the blank rows", () => {
    let diagnoses = addDiagnosis([]);
    diagnoses = addDiagnosis(diagnoses);
    diagnoses = addDiagnosis(diagnoses);
    diagnoses[0] = { ...diagnoses[0], label: " Hypertension artérielle ", code: "I10" };
    diagnoses[1] = { ...diagnoses[1], label: "Surpoids" };
    // diagnoses[2] stays blank
    const sent = input({ ...newForm("p1"), diagnosesTouched: true, diagnoses });
    expect(sent.diagnoses).toEqual([
      { label: "Hypertension artérielle", code: "I10", codeSystem: "CIM-10", isPrimary: true, note: null },
      { label: "Surpoids", code: null, codeSystem: null, isPrimary: false, note: null },
    ]);
  });

  it("keeps the code system the server gave a diagnosis", () => {
    const form = formFromDetail(consultationDetail({ diagnoses: [{ label: "Lombalgie", code: "M54.5", codeSystem: "CIM-10", isPrimary: true }] }));
    form.diagnosesTouched = true;
    expect(input(form).diagnoses?.[0]).toMatchObject({ code: "M54.5", codeSystem: "CIM-10", isPrimary: true });
  });
});

describe("one main diagnosis", () => {
  it("the first one is the main one, designating another releases the previous", () => {
    let diagnoses = addDiagnosis([]);
    expect(diagnoses[0].isPrimary).toBe(true);
    diagnoses = addDiagnosis(diagnoses);
    diagnoses = addDiagnosis(diagnoses);
    expect(diagnoses.map((item) => item.isPrimary)).toEqual([true, false, false]);
    diagnoses = setPrimaryDiagnosis(diagnoses, diagnoses[2].key);
    expect(diagnoses.map((item) => item.isPrimary)).toEqual([false, false, true]);
    expect(diagnoses.filter((item) => item.isPrimary)).toHaveLength(1);
  });

  it("removing the main one hands the role to the first that remains", () => {
    let diagnoses = addDiagnosis(addDiagnosis(addDiagnosis([])));
    diagnoses = removeDiagnosis(diagnoses, diagnoses[0].key);
    expect(diagnoses).toHaveLength(2);
    expect(diagnoses.map((item) => item.isPrimary)).toEqual([true, false]);
    expect(removeDiagnosis(removeDiagnosis(diagnoses, diagnoses[0].key), diagnoses[1].key)).toEqual([]);
  });

  it("holds at twenty", () => {
    let diagnoses = addDiagnosis([]);
    for (let i = 0; i < 30; i += 1) diagnoses = addDiagnosis(diagnoses);
    expect(diagnoses).toHaveLength(MAX_DIAGNOSES);
  });
});

describe("finishing a consultation", () => {
  it("needs a reason, an examination, an assessment or a diagnosis, like on the server", () => {
    const blank = newForm("p1");
    expect(hasClinicalContent(blank)).toBe(false);
    expect(hasClinicalContent({ ...blank, historyPresentIllness: "x", carePlan: "y" })).toBe(false);
    expect(hasClinicalContent({ ...blank, chiefComplaint: "Toux" })).toBe(true);
    expect(hasClinicalContent({ ...blank, clinicalExamination: "x" })).toBe(true);
    expect(hasClinicalContent({ ...blank, assessment: "x" })).toBe(true);
    expect(hasClinicalContent({ ...blank, diagnoses: [{ ...addDiagnosis([])[0], label: "Angine" }] })).toBe(true);
    expect(hasClinicalContent({ ...blank, diagnoses: addDiagnosis([]) })).toBe(false);
    const refused = inputFromForm(blank, "READY_TO_SYNC");
    expect("problems" in refused && refused.problems.messages[0]).toContain("Pour terminer la consultation");
  });

  it("is sent as READY_TO_SYNC", () => {
    expect(input({ ...newForm("p1"), chiefComplaint: "Toux" }, "READY_TO_SYNC").localStatus).toBe("READY_TO_SYNC");
  });
});

describe("a consultation reopened from the device", () => {
  it("fills the form from the stored values, untouched", () => {
    const form = formFromDetail(
      consultationDetail({
        appointmentId: "a1",
        vitalSigns: { systolicBp: 135, temperature: 36.8 },
        diagnoses: [{ label: "Lombalgie", isPrimary: true }],
      }),
    );
    expect(form.vitals.systolicBp).toBe("135");
    expect(form.vitals.temperature).toBe("36,8");
    expect(form.diagnoses[0]).toMatchObject({ label: "Lombalgie", isPrimary: true });
    expect(form.appointmentId).toBe("a1");
    expect(form.vitalsTouched || form.diagnosesTouched).toBe(false);
    // Saved as it is: the stored values are neither resent nor replaced.
    const sent = input(form);
    expect("vitalSigns" in sent || "diagnoses" in sent).toBe(false);
    expect(sent.appointmentId).toBe("a1");
  });
});
