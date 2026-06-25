import { type ReactNode } from "react";

type DashboardContentProps = {
  children: ReactNode;
};

export function DashboardContent({ children }: DashboardContentProps) {
  return (
    <div className="flex-1">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-4 sm:px-6 lg:px-8">
        {children}
      </div>
    </div>
  );
}
