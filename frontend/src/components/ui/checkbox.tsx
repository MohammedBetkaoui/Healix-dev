import * as React from "react";

import { cn } from "@/lib/utils";

export const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn(
      "mt-1 h-4 w-4 rounded border-border text-[var(--accent-dark)] outline-none transition focus:ring-2 focus:ring-ring/25 aria-[invalid=true]:border-[var(--danger-line)]",
      className,
    )}
    {...props}
  />
));

Checkbox.displayName = "Checkbox";
