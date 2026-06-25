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
      "mt-1 h-4 w-4 rounded border-slate-300 text-cyan-600 outline-none transition focus:ring-2 focus:ring-cyan-500/25 aria-[invalid=true]:border-red-400",
      className,
    )}
    {...props}
  />
));

Checkbox.displayName = "Checkbox";
