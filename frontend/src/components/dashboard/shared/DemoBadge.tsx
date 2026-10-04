// Same badge as the verification status cards: marks a widget whose figures
// still come from local demo fixtures rather than the API.
export function DemoBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-[var(--accent-dark)]">
      {label}
    </span>
  );
}
