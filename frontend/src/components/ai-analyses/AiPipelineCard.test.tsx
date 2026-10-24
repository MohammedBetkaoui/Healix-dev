import { renderToStaticMarkup } from "react-dom/server";

import { aiPipelines } from "@/features/ai-analyses/ai-models.registry";
import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import { AiPipelineCard } from "./AiPipelineCard";

const t = (key: string, params?: Record<string, string | number>) => translate(dictionaries.fr, key, params);
const segmentation = aiPipelines.find((pipeline) => pipeline.id === "cardio-seg-mri");
const brain = aiPipelines.find((pipeline) => pipeline.id === "brain");

const render = (pipeline: (typeof aiPipelines)[number] | undefined, lockedLabel?: string) => {
  if (!pipeline) throw new Error("pipeline missing from the registry");
  return renderToStaticMarkup(<AiPipelineCard index="01" lockedLabel={lockedLabel} onSelect={jest.fn()} pipeline={pipeline} selected={false} t={t} />);
};

describe("AiPipelineCard on the AI hub", () => {
  it("names the plan that gives a chain the account's plan does not include", () => {
    const html = render(segmentation, t("subscription.hub.planBadge", { plan: "Premium AI" }));

    expect(html).toContain('data-locked="true"');
    expect(html).toContain("Plan Premium AI");
  });

  it("shows no badge for a chain of the plan", () => {
    const html = render(brain);

    expect(html).not.toContain("data-locked");
    expect(html).not.toContain("Plan ");
  });

  it("stays selectable when locked: the user opens it to see the upgrade", () => {
    const html = render(segmentation, "Plan Premium");

    expect(html).toContain("<button");
    expect(html).not.toContain("disabled");
  });
});
