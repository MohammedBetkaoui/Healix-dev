type VerificationInfoSectionProps = {
  entries: Record<string, string>;
  title: string;
};

export function VerificationInfoSection({
  entries,
  title,
}: VerificationInfoSectionProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <dl className="mt-5 grid gap-4 md:grid-cols-2">
        {Object.entries(entries).map(([label, value]) => (
          <div key={label} className="rounded-xl bg-slate-50 p-4">
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              {label}
            </dt>
            <dd className="mt-2 text-sm font-medium text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
