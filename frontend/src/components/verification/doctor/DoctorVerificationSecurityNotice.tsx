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
    <section className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <LockKeyhole className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
        </div>
      </div>
    </section>
  );
}
