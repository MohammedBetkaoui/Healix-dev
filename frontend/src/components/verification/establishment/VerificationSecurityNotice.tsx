import { LockKeyhole } from "lucide-react";

type VerificationSecurityNoticeProps = {
  text: string;
  title: string;
};

export function VerificationSecurityNotice({
  text,
  title,
}: VerificationSecurityNoticeProps) {
  return (
    <section className="verification-security surface-section overflow-hidden bg-[var(--official-soft)] px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--warning-line)] bg-[var(--surface)] text-[var(--official)]">
          <LockKeyhole className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p>
        </div>
      </div>
    </section>
  );
}
