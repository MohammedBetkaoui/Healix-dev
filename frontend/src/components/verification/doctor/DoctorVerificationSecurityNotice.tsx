import { LockKeyhole } from "lucide-react";

type DoctorVerificationSecurityNoticeProps = {
  text: string;
  title: string;
};

export function DoctorVerificationSecurityNotice({
  text,
  title,
}: DoctorVerificationSecurityNoticeProps) {
  return (
    <section className="rounded-xl border border-border/80 bg-card p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary text-[var(--accent-dark)]">
          <LockKeyhole className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
        </div>
      </div>
    </section>
  );
}
