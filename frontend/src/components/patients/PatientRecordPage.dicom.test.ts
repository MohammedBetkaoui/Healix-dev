import { readFileSync } from "node:fs";
import { join } from "node:path";

// The record page is too heavy to render here: the wiring of the DICOM studies
// in the imaging tab is checked in its source.
const source = readFileSync(join(__dirname, "PatientRecordPage.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("the DICOM studies in the imaging tab of the patient record", () => {
  it("imports the section", () => {
    expect(source).toContain('import { DicomStudiesSection } from "@/components/dicom/DicomStudiesSection"');
  });

  it("shows them above the AI analyses, in the imaging tab only", () => {
    const tab = source.slice(source.indexOf('{activeTab === "imaging" ? ('), source.indexOf('{activeTab === "aiEvolution" ? ('));

    expect(tab).toContain("<DicomStudiesSection");
    expect(tab).toContain("<PatientAiRunsSection");
    expect(tab.indexOf("<DicomStudiesSection")).toBeLessThan(tab.indexOf("<PatientAiRunsSection"));
    expect(source.match(/<DicomStudiesSection/g)).toHaveLength(1);
  });

  it("gives it the account type, the locale, the patient and the translator", () => {
    expect(source).toMatch(
      /<DicomStudiesSection accountType=\{accountType\} locale=\{locale\} patientId=\{patientId\} t=\{t\} \/>/,
    );
  });
});
