import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { dictionaries, locales } from "@/i18n";
import { translate } from "@/lib/i18n";

import { aiModelStatuses, aiModelTasks, aiModules } from "./ai-analyses.types";
import { aiModels } from "./ai-models.registry";

// Keys the hub builds from the registry: t(`aiAnalyses.models.${id}.name`)…
function registryKeys() {
  const keys = new Set<string>();

  for (const aiModule of aiModules) {
    keys.add(`aiAnalyses.modules.${aiModule}.title`);
    keys.add(`aiAnalyses.modules.${aiModule}.description`);
  }
  for (const status of aiModelStatuses) keys.add(`aiAnalyses.statuses.${status}`);
  for (const task of aiModelTasks) keys.add(`aiAnalyses.tasks.${task}`);
  for (const model of aiModels) {
    keys.add(`aiAnalyses.models.${model.id}.name`);
    keys.add(`aiAnalyses.models.${model.id}.intendedUse`);
    if (model.inputModality) keys.add(`aiAnalyses.modalities.${model.inputModality}`);
    for (const outputClass of model.outputClasses) keys.add(`aiAnalyses.classes.${outputClass}`);
    for (const metric of model.metrics ?? []) keys.add(`aiAnalyses.metrics.${metric.key}`);
    for (const limitation of model.knownLimitations) keys.add(`aiAnalyses.limitations.${limitation}`);
  }

  return [...keys];
}

// Literal keys written in the hub components: t("aiAnalyses.…").
function componentKeys() {
  const directory = join(__dirname, "../../components/ai-analyses");

  return readdirSync(directory)
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
    expect(componentKeys().length).toBeGreaterThan(20);
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
