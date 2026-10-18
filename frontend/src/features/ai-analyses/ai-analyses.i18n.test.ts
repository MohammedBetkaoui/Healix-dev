import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { dictionaries, locales } from "@/i18n";
import { translate } from "@/lib/i18n";

import { aiModelStatuses, aiModelTasks, aiModules, aiRunDecisions, nucleusTypes } from "./ai-analyses.types";
import { aiModels, aiPipelines, pipelineSteps } from "./ai-models.registry";
import { aiDecisionLabels, getDecisionOptions, knownDecisionErrorCodes } from "./run-decision";
import { knownLaunchErrorCodes, knownRunErrorCodes } from "./run-presentation";
import { knownReportErrorKeys } from "./run-report";
import { TRACKING_DECISIONS, TRACKING_PERIODS, TRACKING_PIPELINES, TRACKING_STATUSES, TRACKING_TABS } from "./runs-tracking";
import { qualityCheckKeys, qualityCheckStatuses } from "./quality-check";

// Mirrors the steps of components/ai-analyses/wizard/AiAnalysisWizardPage.
const wizardSteps = ["patient", "image", "quality", "reading"];
const wizardStepStates = ["done", "current", "upcoming"];

// Keys the hub builds from the registry: t(`aiAnalyses.models.${id}.name`)…
function registryKeys() {
  const keys = new Set<string>();

  for (const aiModule of aiModules) {
    keys.add(`aiAnalyses.modules.${aiModule}.title`);
    keys.add(`aiAnalyses.modules.${aiModule}.description`);
  }
  for (const status of aiModelStatuses) keys.add(`aiAnalyses.statuses.${status}`);
  keys.add("aiAnalyses.statusNotes.requires_multisequence");
  keys.add("aiAnalyses.statusNotes.documentation_pending");
  keys.add("aiAnalyses.statusNotes.noPipeline");
  for (const task of aiModelTasks) keys.add(`aiAnalyses.tasks.${task}`);
  for (const model of aiModels) {
    keys.add(`aiAnalyses.models.${model.id}.name`);
    keys.add(`aiAnalyses.models.${model.id}.intendedUse`);
    if (model.inputModality) keys.add(`aiAnalyses.modalities.${model.inputModality}`);
    for (const outputClass of model.outputClasses) keys.add(`aiAnalyses.classes.${outputClass}`);
    for (const metric of model.metrics ?? []) keys.add(`aiAnalyses.metrics.${metric.key}`);
    for (const metric of model.metrics ?? []) {
      if (metric.dataset) keys.add(`aiAnalyses.datasets.${metric.dataset}`);
    }
    if (model.classMetricsDataset) keys.add(`aiAnalyses.datasets.${model.classMetricsDataset}`);
    for (const limitation of model.knownLimitations) keys.add(`aiAnalyses.limitations.${limitation}`);
  }
  for (const pipeline of aiPipelines) {
    for (const field of ["documentTitle", "documentHint", "qualityTitle", "qualityHint", "readingTitle"]) {
      keys.add(`aiAnalyses.wizard.workspace.pipelines.${pipeline.id}.${field}`);
    }
    keys.add(`aiAnalyses.wizard.workspace.readingPlaceholders.${pipeline.id}`);
    for (const field of ["title", "description", "input", "output"]) {
      keys.add(`aiAnalyses.hub.analyses.${pipeline.id}.${field}`);
    }
    keys.add(`aiAnalyses.pipelines.${pipeline.id}.name`);
    keys.add(`aiAnalyses.pipelines.${pipeline.id}.description`);
    keys.add(`aiAnalyses.pipelines.${pipeline.id}.launch`);
    for (const step of pipelineSteps[pipeline.id]) keys.add(`aiAnalyses.pipelines.${pipeline.id}.steps.${step}`);
    keys.add(`aiAnalyses.wizard.reading.impressionHints.${pipeline.id}`);
    // Decision options of the chain: a nuclei map has its own wording.
    for (const decision of getDecisionOptions(pipeline.id)) {
      const family = pipeline.id === "pathology-nuclei" ? "nuclei" : "";
      keys.add(`aiAnalyses.decision.${family ? `${family}Options` : "options"}.${decision}`);
      keys.add(`aiAnalyses.decision.${family ? `${family}OptionHints` : "optionHints"}.${decision}`);
    }
  }
  for (const state of ["checking", "online", "offline", "unknown"]) keys.add(`aiAnalyses.hub.service.${state}`);
  for (const state of ["ready", "partial", "unavailable", "unchecked"]) keys.add(`aiAnalyses.hub.availability.${state}`);
  for (const step of ["choose", "prepare", "read"]) keys.add(`aiAnalyses.hub.journey.${step}`);
  for (const step of ["patient", "document", "review"]) keys.add(`aiAnalyses.hub.preparation.${step}`);
  for (const step of ["patient", "image", "mri", "signal", "slide", "quality", "reading"]) {
    keys.add(`aiAnalyses.wizard.steps.${step}`);
    keys.add(`aiAnalyses.wizard.workspace.stepHints.${step}`);
  }
  for (const state of ["idle", "loading", "signed", "missing", "error"]) keys.add(`aiAnalyses.wizard.workspace.consent.${state}`);
  for (const state of ["waiting", "checking", "passed", "failed", "incomplete"]) keys.add(`aiAnalyses.wizard.workspace.checkState.${state}`);
  for (const state of ["loading", "status_error", "service_unavailable", "service_not_configured", "service_unauthorized", "service_error", "model_not_loaded"]) {
    keys.add(`aiAnalyses.wizard.reading.launchStates.${state}`);
  }
  for (const code of knownLaunchErrorCodes) keys.add(`aiAnalyses.wizard.reading.launchErrors.${code}`);
  // Built by the breast and nuclei results from their views, warnings and types.
  for (const view of ["original", "flipHorizontal", "flipVertical", "flipBoth"]) {
    keys.add(`aiAnalyses.run.pathology.breast.views.${view}`);
  }
  for (const kind of ["falsePositive", "falseNegative"]) keys.add(`aiAnalyses.run.pathology.breast.warnings.${kind}`);
  for (const type of nucleusTypes) keys.add(`aiAnalyses.classes.${type}`);
  for (const cell of ["trueNegative", "falsePositive", "falseNegative", "truePositive"]) {
    keys.add(`aiAnalyses.sheet.matrixCells.${cell}`);
  }
  for (const code of [...knownRunErrorCodes, "unknown"]) {
    keys.add(`aiAnalyses.run.errors.${code}`);
  }
  for (const reason of ["not_applicable_for_class", "model_not_loaded"]) {
    keys.add(`aiAnalyses.run.skipped.${reason}`);
  }
  // Built by the follow-up page from its tabs, filters and periods.
  for (const tab of TRACKING_TABS) keys.add(`aiAnalyses.tracking.tabs.${tab}`);
  for (const decision of TRACKING_DECISIONS) keys.add(`aiAnalyses.tracking.filters.decisions.${decision}`);
  for (const status of TRACKING_STATUSES) keys.add(`aiAnalyses.tracking.filters.statuses.${status}`);
  for (const period of TRACKING_PERIODS) keys.add(`aiAnalyses.tracking.agreement.periods.${period}`);
  for (const column of ["date", "patient", "pipeline", "modelClass", "uncertain", "mask", "decision", "result"]) {
    keys.add(`aiAnalyses.tracking.worklist.columns.${column}`);
  }
  for (const pipeline of TRACKING_PIPELINES) {
    keys.add(pipeline === "all" ? "aiAnalyses.tracking.filters.pipelines.all" : `aiAnalyses.pipelines.${pipeline}.name`);
  }
  // Picked from the report's availability and download error.
  for (const blocker of ["notSucceeded", "notDecided", "rejected"]) keys.add(`aiAnalyses.report.blockers.${blocker}`);
  for (const key of [...knownReportErrorKeys, "unknown"]) keys.add(`aiAnalyses.report.errors.${key}`);
  // Picked by the result page from the confusion warning's kind.
  for (const kind of ["missedGlioma", "missedGliomaNegative", "otherClasses"]) {
    keys.add(`aiAnalyses.run.confusion.${kind}`);
  }
  // Built by the decision panel and the patient record from the decision lists.
  for (const decision of aiRunDecisions) {
    keys.add(`aiAnalyses.decision.statuses.${decision}`);
    keys.add(`aiAnalyses.decision.options.${decision}`);
    keys.add(`aiAnalyses.decision.optionHints.${decision}`);
    keys.add(`aiAnalyses.decision.recordNotes.${decision}`);
  }
  for (const decision of ["CORRECTED", "REJECTED"]) keys.add(`aiAnalyses.decision.reasonLabels.${decision}`);
  for (const decision of ["VALIDATED", "CORRECTED"]) keys.add(`aiAnalyses.record.latest.${decision}`);
  for (const agreement of ["agrees", "disagrees", "rejected"]) keys.add(`aiAnalyses.decision.agreement.${agreement}`);
  for (const code of [...knownDecisionErrorCodes, "unknown"]) keys.add(`aiAnalyses.decision.errors.${code}`);
  for (const label of aiDecisionLabels) keys.add(`aiAnalyses.classes.${label}`);
  for (const status of ["RUNNING", "FAILED", "REJECTED_INPUT"]) keys.add(`aiAnalyses.record.runStatuses.${status}`);
  // Built by the wizard from its step and check lists.
  for (const step of wizardSteps) {
    keys.add(`aiAnalyses.wizard.steps.${step}`);
    keys.add(`aiAnalyses.wizard.${step}.title`);
  }
  for (const state of wizardStepStates) keys.add(`aiAnalyses.wizard.stepStates.${state}`);
  for (const check of qualityCheckKeys) keys.add(`aiAnalyses.wizard.quality.checks.${check}`);
  for (const status of qualityCheckStatuses) keys.add(`aiAnalyses.wizard.quality.statuses.${status}`);

  return [...keys];
}

// Literal keys written in the module's components (wizard/ and viewer/
// included): t("aiAnalyses.…").
function componentKeys() {
  const directory = join(__dirname, "../../components/ai-analyses");

  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".tsx"))
    .flatMap((file) =>
      [...readFileSync(join(directory, file), "utf8").matchAll(/\bt\("(aiAnalyses\.[\w.-]+)"/g)].map(
        (match) => match[1],
      ),
    );
}

describe("aiAnalyses i18n keys", () => {
  it("finds the keys to check", () => {
    expect(registryKeys().length).toBeGreaterThan(40);
    expect(componentKeys().length).toBeGreaterThan(80);
  });

  it.each(locales)("translates every key of the registry and the components in %s", (locale) => {
    const keys = [...new Set([...registryKeys(), ...componentKeys()])];
    // translate() returns the key itself when it is missing.
    const missing = keys.filter((key) => {
      const value = translate(dictionaries[locale], key);
      return value === key || value.trim() === "";
    });

    expect(missing).toEqual([]);
  });

  it.each(locales)("names no model the registry does not list in %s", (locale) => {
    expect(Object.keys(dictionaries[locale].aiAnalyses.models).sort()).toEqual(
      aiModels.map((model) => model.id).sort(),
    );
  });
});
