import * as React from "react";

import { cn } from "@/lib/utils";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "flex h-11 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-[var(--accent-line)] focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-[var(--danger-line)] aria-[invalid=true]:focus:ring-[var(--danger)]/20",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));

Select.displayName = "Select";
