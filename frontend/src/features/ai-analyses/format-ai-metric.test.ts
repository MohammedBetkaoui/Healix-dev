import { readFileSync } from "node:fs";
import { join } from "node:path";

import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import { limitationParams } from "./format-ai-metric";
import { pannukeEvaluationSource } from "./pathology-evaluation";

const EVALUATION_DIR = join(__dirname, "../../../../ai-service/evaluation");
// Without the bidi isolates around each quoted figure.
const plain = (text: string) => text.replace(/[⁦-⁩]/g, "");

describe("limitationParams", () => {
  it("quotes PanNuke's spread across organs from its report, with two decimals", () => {
    const report = JSON.parse(readFileSync(join(EVALUATION_DIR, pannukeEvaluationSource.report), "utf8"));
    const dice = Object.values(report.pannuke.byTissue as Record<string, { nucleiMeanDice: number }>).map(
      (tissue) => tissue.nucleiMeanDice,
    );
    const decimal = new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
    const [min, max] = [decimal.format(Math.min(...dice)), decimal.format(Math.max(...dice))];
    const params = limitationParams("tissueDependent", "fr");

    expect(params && Object.fromEntries(Object.entries(params).map(([key, value]) => [key, plain(value)]))).toEqual({ max, min });
    expect(min).toMatch(/^0,\d\d$/);
    expect(plain(translate(dictionaries.fr, "aiAnalyses.limitations.tissueDependent", params))).toBe(
      `Performance variable selon l’organe : Dice des noyaux de ${min} à ${max} sur le test.`,
    );
  });

  it("fills every placeholder of the limitation in Arabic too", () => {
    const text = translate(dictionaries.ar, "aiAnalyses.limitations.tissueDependent", limitationParams("tissueDependent", "ar"));

    expect(text).not.toMatch(/[{}]/);
    expect(text).toContain("Dice");
  });
});
