import { type LucideIcon } from "lucide-react";

type AdminStatCardProps = {
  badge?: string;
  icon: LucideIcon;
  label: string;
  value: number;
};

export function AdminStatCard({
  badge,
  icon: Icon,
  label,
  value,
}: AdminStatCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-[#0b3b5f]">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        {badge ? (
          <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-700">
            {badge}
          </span>
        ) : null}
      </div>
      <p className="mt-5 text-3xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-1 text-sm font-medium text-slate-600">{label}</p>
    </div>
  );
}
