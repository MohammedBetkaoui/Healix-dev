import { AxiosError, type AxiosResponse } from "axios";

import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import { consultationLabel, getConsultationErrorKey, initialConsultationFilters, toConsultationListFilters, truncateText } from "./consultation-utils";

describe("toConsultationListFilters", () => {
  it("sends only what is filled, a day as the whole day, and the debounced search", () => {
    expect(toConsultationListFilters({ ...initialConsultationFilters, from: "2026-10-01", mine: true, patient: "p1", prescription: "without", query: "ignored", to: "2026-10-31" }, "grippe", 2, 20)).toEqual({
      from: "2026-10-01T00:00:00.000Z",
      limit: 20,
      mine: true,
      page: 2,
      patientId: "p1",
      prescription: "without",
      query: "grippe",
      to: "2026-10-31T23:59:59.999Z",
    });
    expect(toConsultationListFilters(initialConsultationFilters, "", 1, 20)).toEqual({
      from: undefined, limit: 20, mine: undefined, page: 1, patientId: undefined, prescription: undefined, query: undefined, to: undefined,
    });
  });
});

describe("truncateText", () => {
  it("keeps a short text and cuts a long one on a word, with an ellipsis", () => {
    expect(truncateText("Toux  sèche\ndepuis 3 jours")).toBe("Toux sèche depuis 3 jours");
    expect(truncateText("Douleur thoracique à l’effort avec irradiation vers le bras gauche depuis deux semaines", 40)).toBe("Douleur thoracique à l’effort avec…");
    expect(truncateText("x".repeat(100), 20)).toBe(`${"x".repeat(20)}…`);
  });
});

describe("consultationLabel", () => {
  it("names a consultation by its date and its reason", () => {
    expect(consultationLabel("2026-10-20T09:00:00Z", "Douleur thoracique", "fr")).toMatch(/^20\/10\/2026 — Douleur thoracique$/);
  });
});

describe("getConsultationErrorKey", () => {
  const failure = (status: number) => new AxiosError("failed", "ERR_BAD_REQUEST", undefined, undefined, { data: {}, status } as AxiosResponse);

  it("tells a missing answer, a refusal, an unknown consultation and bad criteria apart", () => {
    expect(getConsultationErrorKey(new AxiosError("Network Error"))).toBe("network");
    expect(getConsultationErrorKey(failure(403))).toBe("forbidden");
    expect(getConsultationErrorKey(failure(404))).toBe("notFound");
    expect(getConsultationErrorKey(failure(400))).toBe("invalid");
    expect(getConsultationErrorKey(failure(500))).toBe("unknown");
    expect(getConsultationErrorKey(new Error("boom"))).toBe("unknown");
  });

  it("has a message in French and in Arabic for each of them", () => {
    for (const locale of ["fr", "ar"] as const) {
      for (const key of ["unknown", "network", "forbidden", "notFound", "invalid"]) {
        const path = `consultations.errors.${key}`;
        expect(translate(dictionaries[locale], path)).not.toBe(path);
      }
    }
  });
});
