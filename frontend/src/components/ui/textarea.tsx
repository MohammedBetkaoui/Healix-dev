import * as React from "react";

import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-24 w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-[var(--accent-line)] focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-[var(--danger-line)] aria-[invalid=true]:focus:ring-[var(--danger)]/20",
      className,
    )}
    {...props}
  />
));

Textarea.displayName = "Textarea";
