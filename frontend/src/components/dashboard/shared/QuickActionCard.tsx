import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

type QuickActionCardProps = {
  description: string;
  href: string;
  icon: LucideIcon;
  title: string;
};

export function QuickActionCard({
  description,
  href,
  icon: Icon,
  title,
}: QuickActionCardProps) {
  return (
    <Link
      href={href}
      className="group rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-[0_16px_40px_rgba(14,116,144,0.08)]"
    >
      <div className="flex items-start justify-between gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition group-hover:bg-cyan-50 group-hover:text-cyan-700">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <ChevronRight className="h-4 w-4 text-slate-300 transition group-hover:text-cyan-700" />
      </div>
      <div className="mt-5">
        <h3 className="text-base font-semibold text-slate-950">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      </div>
    </Link>
  );
}
