"use client";

import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { type TranslationFunction } from "@/lib/i18n";

import { useUpdateOpeningHours } from "../hooks/use-organization";
import { type OrganizationResponse } from "../types/organization.types";
import {
  buildOpeningHoursPayload,
  defaultPeriod,
  MAX_PERIODS_PER_DAY,
  openingHoursValues,
  type OpeningHoursFormErrors,
  type OpeningHoursFormValues,
  submitOpeningHours,
} from "../utils/organization-form";
import { TimeInput } from "./OrganizationFields";
import { InlineMessage, SectionCard } from "./OrganizationStateViews";

type DayKey = keyof OpeningHoursFormValues;

export function OpeningHoursSection({
  organization,
  t,
}: {
  organization: OrganizationResponse;
  t: TranslationFunction;
}) {
  const update = useUpdateOpeningHours();
  const [values, setValues] = useState<OpeningHoursFormValues>(() =>
    openingHoursValues(organization),
  );
  const [errors, setErrors] = useState<OpeningHoursFormErrors>({});
  const [notice, setNotice] = useState<{
    message: string;
    tone: "error" | "success";
  } | null>(null);

  // Both sides carry the exact structure the backend stores: what differs is
  // what will change.
  const dirty =
    JSON.stringify(buildOpeningHoursPayload(values)) !==
    JSON.stringify(buildOpeningHoursPayload(openingHoursValues(organization)));

  const touch = (day: DayKey) => {
    setErrors((current) => ({ ...current, [day]: undefined }));
    setNotice(null);
  };

  // Opening a day with no period yet gives it the usual one at once; the
  // stored periods of a now-closed day stay hidden and the payload drops them.
  const toggleClosed = (day: DayKey) => (closed: boolean) => {
    setValues((current) => {
      const dayValue = current[day];
      return {
        ...current,
        [day]: closed
          ? { closed: true, periods: dayValue.periods }
          : {
              closed: false,
              periods:
                dayValue.periods.length > 0
                  ? dayValue.periods
                  : [defaultPeriod()],
            },
      };
    });
    touch(day);
  };

  const setPeriodTime =
    (day: DayKey, index: number, boundary: "end" | "start") =>
    (value: string) => {
      setValues((current) => ({
        ...current,
        [day]: {
          ...current[day],
          periods: current[day].periods.map((period, periodIndex) =>
            periodIndex === index ? { ...period, [boundary]: value } : period,
          ),
        },
      }));
      touch(day);
    };

  const addPeriod = (day: DayKey) => {
    setValues((current) => ({
      ...current,
      [day]: {
        ...current[day],
        periods: [...current[day].periods, defaultPeriod()],
      },
    }));
    touch(day);
  };

  // The last period goes, the day closes: an open day always shows at least
  // one period, as the backend demands.
  const removePeriod = (day: DayKey, index: number) => {
    setValues((current) => {
      const periods = current[day].periods.filter(
        (_, periodIndex) => periodIndex !== index,
      );
      return periods.length === 0
        ? { ...current, [day]: { closed: true, periods: [] } }
        : { ...current, [day]: { ...current[day], periods } };
    });
    touch(day);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (update.isPending) return;
    setNotice(null);

    const outcome = await submitOpeningHours(values, {
      send: update.mutateAsync,
      t,
    });
    if (outcome.status === "success") {
      setValues(openingHoursValues(outcome.organization));
      setErrors({});
      setNotice({ message: t("organization.notices.saved"), tone: "success" });
    } else if (outcome.status === "unchanged") {
      setNotice({
        message: t("organization.notices.nothingToSave"),
        tone: "success",
      });
    } else {
      setErrors(outcome.errors);
      if (outcome.status === "failed" && outcome.message)
        setNotice({ message: outcome.message, tone: "error" });
    }
  };

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      noValidate
      aria-busy={update.isPending}
      className="space-y-5"
    >
      <SectionCard
        title={t("organization.hours.title")}
        description={t("organization.hours.subtitle")}
      >
        <div className="space-y-3">
          {(Object.keys(values) as DayKey[]).map((day) => {
            const dayValue = values[day];

            return (
              <div
                key={day}
                className="rounded-[var(--radius-sm)] border border-[var(--line-soft)] p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <Label
                    htmlFor={`organization-hours-${day}-closed`}
                    className="text-[.8rem] font-medium text-[var(--text-primary)]"
                  >
                    {t(`organization.hours.days.${day}`)}
                  </Label>
                  <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                    {t("organization.hours.closed")}
                    <Checkbox
                      id={`organization-hours-${day}-closed`}
                      checked={dayValue.closed}
                      onChange={(event) =>
                        toggleClosed(day)(event.target.checked)
                      }
                      aria-label={`${t(`organization.hours.days.${day}`)} — ${t("organization.hours.closed")}`}
                    />
                  </label>
                </div>
                {dayValue.closed ? null : (
                  <div className="mt-2 space-y-2">
                    {dayValue.periods.map((period, index) => (
                      <div
                        key={`${day}-${index}`}
                        className="flex items-center gap-2"
                      >
                        <TimeInput
                          id={`organization-hours-${day}-start-${index}`}
                          value={period.start}
                          onChange={setPeriodTime(day, index, "start")}
                          ariaLabel={`${t(`organization.hours.days.${day}`)} — ${t("organization.hours.periodStart")}`}
                        />
                        <span
                          className="text-xs text-[var(--text-secondary)]"
                          aria-hidden="true"
                        >
                          –
                        </span>
                        <TimeInput
                          id={`organization-hours-${day}-end-${index}`}
                          value={period.end}
                          onChange={setPeriodTime(day, index, "end")}
                          ariaLabel={`${t(`organization.hours.days.${day}`)} — ${t("organization.hours.periodEnd")}`}
                        />
                        <button
                          type="button"
                          className="clinical-button ml-auto p-2 text-xs"
                          aria-label={`${t("organization.hours.removePeriod")} — ${t(`organization.hours.days.${day}`)}`}
                          onClick={() => removePeriod(day, index)}
                        >
                          <Trash2
                            size={14}
                            strokeWidth={1.8}
                            aria-hidden="true"
                          />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="clinical-button text-xs"
                      disabled={dayValue.periods.length >= MAX_PERIODS_PER_DAY}
                      onClick={() => addPeriod(day)}
                    >
                      <Plus
                        size={13}
                        className="me-1 inline"
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                      {t("organization.hours.addPeriod")}
                    </button>
                    {errors[day] ? (
                      <p
                        role="alert"
                        className="text-xs text-[var(--danger-ink)]"
                      >
                        {errors[day]}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {notice ? (
        <InlineMessage message={notice.message} tone={notice.tone} />
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="clinical-button"
          disabled={!dirty || update.isPending}
          onClick={() => {
            setValues(openingHoursValues(organization));
            setErrors({});
            setNotice(null);
          }}
        >
          {t("organization.actions.reset")}
        </button>
        <button
          type="submit"
          className="clinical-button clinical-button-primary"
          disabled={!dirty || update.isPending}
        >
          {update.isPending
            ? t("organization.actions.saving")
            : t("organization.actions.save")}
        </button>
      </div>
    </form>
  );
}
