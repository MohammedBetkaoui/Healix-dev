import { type ReactNode } from "react";

type DashboardContentProps = {
  children: ReactNode;
};

export function DashboardContent({ children }: DashboardContentProps) {
  return (
    <div className="flex-1">
      <div id="clinical-content" tabIndex={-1} className="clinical-content w-full">
        {children}
      </div>
    </div>
  );
}
