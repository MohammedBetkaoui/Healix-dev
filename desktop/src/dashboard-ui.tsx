import type { ComponentProps, ReactNode } from "react";
import { ArrowLeft, WifiOff, type LucideIcon } from "lucide-react";

// Building blocks of the Desktop dashboard. The class strings are the Web
// app's own (components/ui/button.tsx, PatientRegistryPage.tsx) so a control
// looks the same on both surfaces.

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function initials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

export function formatDate(value?: string | null) {
  if (!value) return "Jamais";
  return new Intl.DateTimeFormat("fr-DZ", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatBirthDate(value?: string | null) {
  if (!value) return "Non renseignée";
  return new Intl.DateTimeFormat("fr-DZ", { dateStyle: "medium" }).format(new Date(value));
}

export function ageFromBirthDate(value?: string | null) {
  if (!value) return null;
  const birth = new Date(value);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

type ButtonVariant = "default" | "secondary" | "outline" | "ghost";
type ButtonSize = "default" | "sm";

const buttonVariants: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground shadow-sm hover:bg-[var(--action-hover)]",
  secondary: "border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)] hover:bg-secondary",
  outline: "border border-[var(--line)] bg-[var(--panel)] text-[var(--ink-soft)] shadow-none hover:bg-[var(--panel-soft)]",
  ghost: "text-[var(--ink-soft)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-dark)]",
};

const buttonSizes: Record<ButtonSize, string> = {
  default: "h-11 px-4 py-2 text-sm",
  sm: "h-9 px-3 text-sm",
};

export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:pointer-events-none disabled:opacity-60",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  );
}

const fieldBase =
  "w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel)] px-3 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-60";

export const inputClass = `h-11 ${fieldBase}`;
export const textareaClass = `min-h-28 resize-y py-2.5 leading-6 ${fieldBase}`;

export function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="mb-1.5 block text-[0.7rem] font-semibold text-[var(--ink-soft)]">{label}</span>
      {children}
    </label>
  );
}

export type MetricItem = {
  icon: LucideIcon;
  tone: "neutral" | "success" | "accent";
  value: string;
  label: string;
  note?: string;
  // Long identifiers (record numbers) use a smaller figure so they are not cut.
  compact?: boolean;
};

const metricTones: Record<MetricItem["tone"], string> = {
  neutral: "bg-[var(--panel)] text-[var(--institutional)] ring-1 ring-[var(--line)]",
  success: "bg-[var(--success-soft)] text-[var(--success-ink)] ring-1 ring-[var(--success-line)]",
  accent: "bg-[var(--accent-soft)] text-[var(--accent-dark)] ring-1 ring-[var(--accent-line)]",
};

// The strip of figures under a page header (Web: patient registry).
export function MetricStrip({ items }: { items: MetricItem[] }) {
  return (
    <dl
      className={cn(
        "grid border-t border-[var(--line)] bg-[var(--panel-soft)]",
        items.length === 4 ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-3",
      )}
    >
      {items.map(({ icon: Icon, tone, value, label, note, compact }) => (
        <div
          key={label}
          className="flex min-w-0 items-center gap-3 border-[var(--line)] px-5 py-4 not-first:border-t sm:border-e sm:not-first:border-t-0 sm:last:border-e-0 lg:px-7"
        >
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)]", metricTones[tone])}>
            <Icon className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <dd className={cn("clinical-figure truncate font-semibold text-[var(--ink)]", compact ? "text-sm leading-7" : "text-lg")}>{value}</dd>
            <dt className="text-xs font-medium text-[var(--ink)]">{label}</dt>
            {note ? <p className="mt-0.5 text-[0.68rem] text-[var(--ink-faint)]">{note}</p> : null}
          </div>
        </div>
      ))}
    </dl>
  );
}

// Page header card: icon tile, eyebrow, title, description and actions (Web:
// patient registry, DICOM study overview).
export function PageHeader({
  icon,
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  icon: ReactNode;
  eyebrow: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="surface-section surface-raised relative overflow-hidden border-t-2 border-t-[var(--medical)]">
      <div className="grid gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:px-7">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--medical-soft)] text-[var(--medical)] ring-1 ring-[var(--accent-line)]">
            {icon}
          </span>
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[var(--medical)]">
              {eyebrow}
            </span>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-[var(--ink)] sm:text-[1.75rem]">{title}</h1>
            {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-soft)]">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2 lg:justify-end">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}

export function Notice({ tone = "neutral", icon, children }: { tone?: "neutral" | "danger"; icon?: ReactNode; children: ReactNode }) {
  return (
    <aside
      role={tone === "danger" ? "alert" : undefined}
      className={cn(
        "flex items-start gap-2 rounded-[var(--radius-sm)] border px-3 py-2.5 text-[0.7rem] leading-5",
        tone === "danger"
          ? "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]"
          : "border-[var(--line)] bg-[var(--panel-soft)] text-[var(--ink-faint)]",
      )}
    >
      {icon}
      <span className="min-w-0">{children}</span>
    </aside>
  );
}

export function Pill({ tone, children }: { tone: "success" | "warning" | "danger" | "accent" | "neutral"; children: ReactNode }) {
  const tones = {
    success: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]",
    warning: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
    danger: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
    accent: "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]",
    neutral: "border-[var(--line)] bg-muted text-[var(--ink-soft)]",
  } as const;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.65rem] font-medium", tones[tone])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
      {children}
    </span>
  );
}

// The Web StatusBadge (components/dashboard/shared/StatusBadge.tsx).
export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

const statusTones: Record<StatusTone, string> = {
  neutral: "border-[var(--line)] bg-[var(--panel-soft)] text-[var(--ink-soft)]",
  success: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]",
  warning: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  danger: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  info: "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]",
};

export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: StatusTone }) {
  return (
    <span
      data-tone={tone}
      className={cn(
        "clinical-status-badge inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 font-[var(--font-auth-mono)] text-[0.66rem] font-medium tracking-[0.03em]",
        statusTones[tone],
      )}
    >
      {label}
    </span>
  );
}

// "Retour" of the detail views.
export function BackButton({ onClick, label = "Retour" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="clinical-link -mb-2" onClick={onClick}>
      <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" />
      {label}
    </button>
  );
}

// The strip shown while the application is offline (same shape as the Web
// subscription banner).
export function OfflineBanner({ children }: { children: ReactNode }) {
  return (
    <section
      role="status"
      data-offline-banner=""
      className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--warning-line)] bg-[var(--warning-soft)] px-5 py-3 text-[var(--warning-ink)]"
    >
      <WifiOff aria-hidden="true" size={18} strokeWidth={1.9} className="mt-0.5 shrink-0" />
      <p className="text-sm font-semibold">{children}</p>
    </section>
  );
}

// Loading, error and empty states of a list: one place, same look everywhere.
export function ListState({ loading, error, empty, children, emptyIcon: Icon, emptyTitle, emptyText }: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  children: ReactNode;
  emptyIcon: LucideIcon;
  emptyTitle: string;
  emptyText: string;
}) {
  if (error) {
    return (
      <div role="alert" className="px-6 py-12 text-center text-sm text-[var(--danger-ink)]">
        {error}
      </div>
    );
  }
  if (loading && empty) {
    return <div role="status" className="px-6 py-12 text-center text-sm text-[var(--ink-faint)]">Chargement…</div>;
  }
  if (empty) {
    return (
      <div className="team-empty">
        <Icon size={32} strokeWidth={1.5} aria-hidden="true" />
        <strong className="text-[var(--ink)]">{emptyTitle}</strong>
        <span>{emptyText}</span>
      </div>
    );
  }
  return <>{children}</>;
}
