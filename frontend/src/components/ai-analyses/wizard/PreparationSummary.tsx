"use client";

import { Check, FileCheck2, FileInput, UserRound } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";
import { type PatientDocument } from "@/types/patient";

import { type ConsentState } from "./PatientStep";

type PreparationSummaryProps = {
  current: number;
  patientName: string | null;
  document: PatientDocument | null;
  consentState: ConsentState;
  qualityState: "waiting" | "checking" | "passed" | "failed" | "incomplete";
  acquisitionSummary: string[];
  expectedResult: string;
  disabled: boolean;
  onEdit: (step: number) => void;
  t: TranslationFunction;
};

export function PreparationSummary({ current, patientName, document, consentState, qualityState, acquisitionSummary, expectedResult, disabled, onEdit, t }: PreparationSummaryProps) {
  return (
    <aside className="ai-preparation-summary" aria-labelledby="ai-preparation-summary-title">
      <div className="ai-preparation-summary-heading"><h2 id="ai-preparation-summary-title">{t("aiAnalyses.wizard.workspace.summaryTitle")}</h2><span>HealixDz</span></div>
      <div className="ai-preparation-summary-body">
        <p className="ai-preparation-summary-hint">{t("aiAnalyses.wizard.workspace.summaryHint")}</p>
        <section className="ai-preparation-entry">
          <div className="ai-preparation-entry-title"><UserRound size={15} aria-hidden="true" /><h3>{t("aiAnalyses.wizard.steps.patient")}</h3>{patientName && current > 0 ? <button type="button" disabled={disabled} onClick={() => onEdit(0)}>{t("aiAnalyses.wizard.workspace.edit")}</button> : null}</div>
          {patientName ? <p className="ai-preparation-value"><bdi>{patientName}</bdi></p> : <p className="ai-preparation-empty">{t("aiAnalyses.wizard.workspace.patientEmpty")}</p>}
          {patientName ? <p className="ai-preparation-consent" data-state={consentState}>{consentState === "signed" ? <Check size={12} aria-hidden="true" /> : null}{t(`aiAnalyses.wizard.workspace.consent.${consentState}`)}</p> : null}
        </section>
        <section className="ai-preparation-entry">
          <div className="ai-preparation-entry-title"><FileInput size={15} aria-hidden="true" /><h3>{t("aiAnalyses.wizard.workspace.document")}</h3>{document && current > 1 ? <button type="button" disabled={disabled} onClick={() => onEdit(1)}>{t("aiAnalyses.wizard.workspace.edit")}</button> : null}</div>
          {document ? <><p className="ai-preparation-value"><bdi>{document.fileName}</bdi></p><p className="ai-preparation-file-meta"><bdi>{document.size}</bdi></p></> : <p className="ai-preparation-empty">{t("aiAnalyses.wizard.workspace.documentEmpty")}</p>}
        </section>
        <section className="ai-preparation-entry">
          <div className="ai-preparation-entry-title"><FileCheck2 size={15} aria-hidden="true" /><h3>{t("aiAnalyses.wizard.steps.quality")}</h3>{current > 2 ? <button type="button" disabled={disabled} onClick={() => onEdit(2)}>{t("aiAnalyses.wizard.workspace.edit")}</button> : null}</div>
          <p className="ai-preparation-check-state" data-state={qualityState}>{qualityState === "passed" ? <Check size={12} aria-hidden="true" /> : null}{t(`aiAnalyses.wizard.workspace.checkState.${qualityState}`)}</p>
          {acquisitionSummary.length > 0 ? <ul className="ai-preparation-settings">{acquisitionSummary.map((item) => <li key={item}>{item}</li>)}</ul> : null}
        </section>
        <div className="ai-preparation-result"><h3>{t("aiAnalyses.wizard.workspace.expectedResult")}</h3><p>{expectedResult}</p></div>
        <p className="ai-preparation-saved-note">{t("aiAnalyses.wizard.workspace.saveNote")}</p>
      </div>
    </aside>
  );
}
