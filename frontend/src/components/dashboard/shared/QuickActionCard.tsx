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
      className="group rounded-[0.95rem] border border-[var(--line)] bg-[var(--panel)]/92 p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[var(--accent-line)] hover:bg-[var(--panel-soft)] hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-[0.76rem] border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)] transition group-hover:border-[var(--accent-line)] group-hover:bg-[var(--accent-soft)] group-hover:text-[var(--accent-dark)]">
          <Icon className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
        </span>
        <ChevronRight className="h-4 w-4 text-[var(--accent)] transition group-hover:translate-x-0.5 group-hover:text-[var(--accent-dark)] rtl:rotate-180 rtl:group-hover:-translate-x-0.5" strokeWidth={1.7} aria-hidden="true" />
      </div>
      <div className="mt-5">
        <h3 className="font-[var(--font-auth-display)] text-[1.08rem] font-medium text-[var(--ink)]">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{description}</p>
      </div>
    </Link>
  );
}
