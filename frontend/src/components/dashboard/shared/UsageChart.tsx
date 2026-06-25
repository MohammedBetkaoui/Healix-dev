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
) {
  const values = data.map((entry) => entry[valueKey] ?? 0);
  const maxValue = Math.max(...values, 1);
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

function buildAreaPath(data: DashboardLinePoint[], height: number, width: number) {
  const polyline = buildPolyline(data, "primary", height, width);
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
      <section className="rounded-[26px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-950">{props.title}</h2>
          <p className="mt-1 text-sm text-slate-500">{props.subtitle}</p>
        </div>
        <div className="flex h-[252px] items-end justify-between gap-3">
          {props.data.map((entry) => {
            const secondaryHeight = entry.secondary
              ? `${(entry.secondary / maxValue) * 100}%`
              : "0%";

            return (
              <div key={entry.label} className="flex flex-1 flex-col items-center gap-3">
                <div className="flex h-full w-full items-end justify-center gap-2">
                  <div
                    className="w-full max-w-8 rounded-full bg-slate-900/80"
                    style={{ height: `${(entry.primary / maxValue) * 100}%` }}
                  />
                  {entry.secondary ? (
                    <div
                      className="w-full max-w-8 rounded-full bg-slate-200"
                      style={{ height: secondaryHeight }}
                    />
                  ) : null}
                </div>
                <span className="text-xs font-medium text-slate-500">{entry.label}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-6 flex flex-wrap gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-900/80" />
            {props.legendPrimary}
          </span>
          {props.legendSecondary ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
              {props.legendSecondary}
            </span>
          ) : null}
        </div>
      </section>
    );
  }

  const width = 720;
  const height = 240;
  const primaryPoints = buildPolyline(props.data, "primary", height, width);
  const secondaryPoints = buildPolyline(props.data, "secondary", height, width);
  const areaPath = buildAreaPath(props.data, height, width);

  return (
    <section className="rounded-[26px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{props.title}</h2>
          <p className="mt-1 text-sm text-slate-500">{props.subtitle}</p>
        </div>
        <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-600">
          {props.periodLabel}
        </div>
      </div>
      <div className="rounded-[22px] border border-slate-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbfd_100%)] p-4">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[240px] w-full"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {[0, 1, 2, 3].map((index) => (
            <line
              key={index}
              x1="0"
              x2={width}
              y1={(height / 4) * index + 12}
              y2={(height / 4) * index + 12}
              stroke="#e2e8f0"
              strokeDasharray="4 6"
            />
          ))}
          <path d={areaPath} fill="rgba(14,116,144,0.08)" />
          <polyline
            fill="none"
            points={secondaryPoints}
            stroke="#94a3b8"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
          <polyline
            fill="none"
            points={primaryPoints}
            stroke="#0f172a"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
        </svg>
        <div className="mt-3 grid grid-cols-6 gap-2 text-center text-xs font-medium text-slate-400">
          {props.data.map((entry) => (
            <span key={entry.label}>{entry.label}</span>
          ))}
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-900" />
          {props.legendPrimary}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
          {props.legendSecondary}
        </span>
      </div>
    </section>
  );
}
