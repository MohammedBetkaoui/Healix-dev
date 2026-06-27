import { CheckCircle2, CircleDashed } from "lucide-react";

import { type VerificationDetail } from "@/types/admin";

type VerificationTimelineProps = {
  detail: VerificationDetail;
  title: string;
};

export function VerificationTimeline({ detail, title }: VerificationTimelineProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <div className="mt-5 space-y-4">
        {detail.timeline.map((event) => {
          const isDone = event.status === "DONE";
          return (
            <div key={event.id} className="flex gap-3">
              <span className="mt-0.5 text-cyan-700">
                {isDone ? (
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <CircleDashed className="h-5 w-5" aria-hidden="true" />
                )}
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {event.label}
                </p>
                <p className="mt-1 text-xs text-slate-500">{event.date}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
