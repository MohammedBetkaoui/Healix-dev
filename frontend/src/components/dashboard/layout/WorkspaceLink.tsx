"use client";

import Link from "next/link";
import { createContext, useContext, type ComponentProps } from "react";

export const WorkspaceNavigationContext = createContext<((label: string) => void) | null>(null);

/** Keep legacy hash navigation, while explicitly identifying unimplemented modules. */
export function WorkspaceLink({ href, onClick, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const showUnavailable = useContext(WorkspaceNavigationContext);
  return <Link {...props} href={href} onClick={(event) => {
    onClick?.(event);
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (href.startsWith("#") && !document.getElementById(href.slice(1))) {
      showUnavailable?.(event.currentTarget.getAttribute("aria-label") ?? event.currentTarget.textContent ?? "");
    }
  }} />;
}
