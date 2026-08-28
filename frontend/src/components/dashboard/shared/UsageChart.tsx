"use client";

import { type DashboardBarPoint, type DashboardLinePoint } from "@/types/dashboard";

type UsageChartProps =
  | {
      data: DashboardLinePoint[];
      legendPrimary: string;
      legendSecondary: string;
      periodLabel: string;
      subtitle: string;
      title: string;
      type: "line";
    }
  | {
      data: DashboardBarPoint[];
      legendPrimary: string;
      legendSecondary?: string;
      periodLabel?: string;
      subtitle: string;
      title: string;
      type: "bar";
    };

function buildPolyline(
  data: DashboardLinePoint[],
  valueKey: "primary" | "secondary",
  height: number,
  width: number,
  sharedMaxValue?: number,
) {
  const values = data.map((entry) => entry[valueKey] ?? 0);
  const maxValue = sharedMaxValue ?? Math.max(...values, 1);
  const stepX = width / Math.max(data.length - 1, 1);

  return data
    .map((entry, index) => {
      const value = entry[valueKey] ?? 0;
      const x = index * stepX;
      const y = height - (value / maxValue) * (height - 12) - 6;
      return `${x},${y}`;
    })
    .join(" ");
}

function buildAreaPath(
  data: DashboardLinePoint[],
  height: number,
  width: number,
  sharedMaxValue?: number,
) {
  const polyline = buildPolyline(
    data,
    "primary",
    height,
    width,
    sharedMaxValue,
  );
  const points = polyline.split(" ");

  if (points.length === 0) {
    return "";
  }

  return `M ${points[0]} L ${points.slice(1).join(" L ")} L ${width},${height} L 0,${height} Z`;
}

export function UsageChart(props: UsageChartProps) {
  if (props.type === "bar") {
    const maxValue = Math.max(...props.data.map((entry) => entry.primary), 1);

    return (
      <section className="relative overflow-hidden rounded-[1rem] rounded-bl-[0.4rem] border border-[var(--line)] bg-[var(--panel)]/94 p-6 shadow-[0_1px_2px_rgba(22,33,29,0.03),0_18px_40px_-28px_rgba(22,33,29,0.25)]">
        <svg
          viewBox="0 0 120 34"
          className="pointer-events-none absolute right-5 top-5 h-9 w-28 text-[var(--gold)] opacity-[0.16]"
          fill="none"
          aria-hidden="true"
        >
          <path d="M1 18h28l7-10 9 20 9-25 10 25 8-10h47" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="relative mb-6 pe-20">
          <h2 className="font-[var(--font-auth-display)] text-[1.2rem] font-medium text-[var(--ink)]">{props.title}</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">{props.subtitle}</p>
        </div>
        <div className="relative flex h-[252px] items-end justify-between gap-3 border-b border-dashed border-[var(--line)] bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_62px,rgba(225,219,201,0.68)_63px)] px-2 pt-2">
          {props.data.map((entry) => {
            const secondaryHeight = entry.secondary
              ? `${(entry.secondary / maxValue) * 100}%`
              : "0%";

            return (
              <div key={entry.label} className="flex flex-1 flex-col items-center gap-3">
                <div className="flex h-full w-full items-end justify-center gap-2">
                  <div
                    className="w-full max-w-8 rounded-t-[0.45rem] bg-[var(--accent-dark)] shadow-[0_8px_18px_-12px_rgba(18,61,50,0.65)]"
                    style={{ height: `${(entry.primary / maxValue) * 100}%` }}
                  />
                  {entry.secondary ? (
                    <div
                      className="w-full max-w-8 rounded-t-[0.45rem] bg-[var(--gold-muted)]"
                      style={{ height: secondaryHeight }}
                    />
                  ) : null}
                </div>
                <span className="font-[var(--font-auth-mono)] text-[0.62rem] font-medium text-[var(--ink-faint)]">{entry.label}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-6 flex flex-wrap gap-4 text-xs text-[var(--ink-soft)]">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent-dark)]" />
            {props.legendPrimary}
          </span>
          {props.legendSecondary ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--gold-muted)]" />
              {props.legendSecondary}
            </span>
          ) : null}
        </div>
      </section>
    );
  }

  const width = 720;
  const height = 240;
  const sharedMaxValue = Math.max(
    ...props.data.flatMap((entry) => [entry.primary, entry.secondary ?? 0]),
    1,
  );
  const primaryPoints = buildPolyline(
    props.data,
    "primary",
    height,
    width,
    sharedMaxValue,
  );
  const secondaryPoints = buildPolyline(
    props.data,
    "secondary",
    height,
    width,
    sharedMaxValue,
  );
  const areaPath = buildAreaPath(props.data, height, width, sharedMaxValue);

  return (
    <section className="rounded-[1rem] rounded-bl-[0.4rem] border border-[var(--line)] bg-[var(--panel)]/94 p-6 shadow-[0_1px_2px_rgba(22,33,29,0.03),0_18px_40px_-28px_rgba(22,33,29,0.25)]">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-[var(--font-auth-display)] text-[1.2rem] font-medium text-[var(--ink)]">{props.title}</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">{props.subtitle}</p>
        </div>
        <div className="inline-flex items-center rounded-full border border-[var(--line)] bg-[var(--panel-soft)] px-4 py-2 font-[var(--font-auth-mono)] text-[0.66rem] font-medium text-[var(--ink-soft)]">
          {props.periodLabel}
        </div>
      </div>
      <div className="rounded-[0.9rem] rounded-bl-[0.32rem] border border-[var(--line-soft)] bg-[linear-gradient(180deg,var(--panel)_0%,var(--panel-soft)_100%)] p-4">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[240px] w-full"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="healix-area-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="var(--accent-soft)" stopOpacity="0.18" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3].map((index) => (
            <line
              key={index}
              x1="0"
              x2={width}
              y1={(height / 4) * index + 12}
              y2={(height / 4) * index + 12}
              stroke="var(--line)"
              strokeDasharray="4 6"
            />
          ))}
          <path d={areaPath} fill="url(#healix-area-gradient)" />
          <polyline
            fill="none"
            points={secondaryPoints}
            stroke="var(--gold)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
          <polyline
            fill="none"
            points={primaryPoints}
            stroke="var(--accent-dark)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
          />
        </svg>
        <div className="mt-3 grid grid-cols-6 gap-2 text-center font-[var(--font-auth-mono)] text-[0.62rem] font-medium text-[var(--ink-faint)]">
          {props.data.map((entry) => (
            <span key={entry.label}>{entry.label}</span>
          ))}
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-4 text-xs text-[var(--ink-soft)]">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent-dark)]" />
          {props.legendPrimary}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--gold)]" />
          {props.legendSecondary}
        </span>
      </div>
    </section>
  );
}
