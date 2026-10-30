import { cn } from "../dashboard-ui";

// The two badges of the Web sidebar, with the same classes:
// UnreadCountBadge (components/messaging/messaging-ui.tsx) and DemoBadge
// (components/dashboard/shared/DemoModule.tsx).

export function countBadgeText(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 99 ? "99+" : String(Math.floor(count));
}

export function CountBadge({ count, label, tone = "medical", className }: {
  count: number;
  label: string;
  tone?: "medical" | "danger";
  className?: string;
}) {
  const text = countBadgeText(count);
  if (!text) return null;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-tone={tone}
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[.65rem] font-semibold leading-none text-[var(--primary-foreground)]",
        tone === "danger" ? "bg-[var(--danger)]" : "bg-[var(--medical)]",
        className,
      )}
    >
      {text}
    </span>
  );
}

// "Web", next to an entry that opens the Web platform: DemoBadge's shape, in
// the accent colours instead of the warning ones.
export function WebBadge({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-[var(--radius-sm)] border border-[var(--accent-line)] bg-[var(--accent-soft)] px-1.5 py-px text-[.62rem] font-semibold leading-4 text-[var(--accent-dark)]",
        className,
      )}
    >
      {label}
    </span>
  );
}
