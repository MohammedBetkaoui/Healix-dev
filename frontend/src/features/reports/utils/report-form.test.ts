import {
  canFinalizeForm,
  canSaveReport,
  emptyReportForm,
  formFromReport,
  sectionsFromForm,
} from "./report-form";

describe("report form", () => {
  it("sends the filled sections only, in print order, trimmed", () => {
    expect(sectionsFromForm({ ...emptyReportForm, findings: " Tension 13/8 ", reason: "Contrôle", results: "   " })).toEqual([
      { body: "Contrôle", id: "reason" },
      { body: "Tension 13/8", id: "findings" },
    ]);
  });

  it("saves a draft with a title, and finalizes it with some content too", () => {
    expect(canSaveReport(emptyReportForm)).toBe(false);
    expect(canSaveReport({ ...emptyReportForm, title: "Note" })).toBe(true);
    expect(canFinalizeForm({ ...emptyReportForm, title: "Note" })).toBe(false);
    expect(canFinalizeForm({ ...emptyReportForm, conclusion: "Suivi", title: "Note" })).toBe(true);
    expect(canFinalizeForm({ ...emptyReportForm, reason: "Fièvre", title: "Note" })).toBe(true);
  });

  it("fills the form back from a saved draft", () => {
    expect(formFromReport({ conclusion: null, sections: [{ body: "Fièvre", id: "reason", title: "Motif" }, { body: "x", id: "unknown", title: "?" }], title: "Note" })).toEqual({
      ...emptyReportForm,
      reason: "Fièvre",
      title: "Note",
    });
  });
});
