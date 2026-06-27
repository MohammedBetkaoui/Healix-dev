import { type ReactNode } from "react";

type AdminContentProps = {
  children: ReactNode;
};

export function AdminContent({ children }: AdminContentProps) {
  return <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6">{children}</div>;
}
