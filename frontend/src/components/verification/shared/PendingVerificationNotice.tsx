import { Clock3, PencilLine } from "lucide-react";

import { Button } from "@/components/ui/button";

type PendingVerificationNoticeProps = {
  buttonLabel: string;
  description: string;
  onEdit: () => void;
  title: string;
};

export function PendingVerificationNotice({
  buttonLabel,
  description,
  onEdit,
  title,
}: PendingVerificationNoticeProps) {
  return (
    <section className="rounded-[24px] border border-cyan-100 bg-cyan-50/50 p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-cyan-700 shadow-sm">
            <Clock3 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              {description}
            </p>
          </div>
        </div>
        <Button
          type="button"
          className="w-full rounded-full px-5 lg:w-auto"
          onClick={onEdit}
        >
          <PencilLine className="h-4 w-4" />
          {buttonLabel}
        </Button>
      </div>
    </section>
  );
}
