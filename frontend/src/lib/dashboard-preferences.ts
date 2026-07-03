"use client";

import { useCallback, useSyncExternalStore } from "react";

const sidebarCollapsedStorageKey = "healixdz.dashboard.sidebar.collapsed";
const sidebarCollapsedEventName = "healixdz:dashboard-sidebar-collapsed-change";

type SidebarCollapsedUpdater = boolean | ((currentValue: boolean) => boolean);

function getSidebarCollapsedSnapshot() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(sidebarCollapsedStorageKey) === "true";
}

function subscribeToSidebarCollapsedChanges(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === sidebarCollapsedStorageKey) {
      onStoreChange();
    }
  };

  window.addEventListener(sidebarCollapsedEventName, onStoreChange);
  window.addEventListener("storage", handleStorageChange);

  return () => {
    window.removeEventListener(sidebarCollapsedEventName, onStoreChange);
    window.removeEventListener("storage", handleStorageChange);
  };
}

export function useDashboardSidebarPreference() {
  const isSidebarCollapsed = useSyncExternalStore(
    subscribeToSidebarCollapsedChanges,
    getSidebarCollapsedSnapshot,
    () => false,
  );

  const setSidebarCollapsed = useCallback((nextValue: SidebarCollapsedUpdater) => {
    const currentValue = getSidebarCollapsedSnapshot();
    const resolvedValue =
      typeof nextValue === "function" ? nextValue(currentValue) : nextValue;

    window.localStorage.setItem(
      sidebarCollapsedStorageKey,
      String(resolvedValue),
    );
    window.dispatchEvent(
      new CustomEvent<boolean>(sidebarCollapsedEventName, {
        detail: resolvedValue,
      }),
    );
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((currentValue) => !currentValue);
  }, [setSidebarCollapsed]);

  return {
    isSidebarCollapsed,
    setSidebarCollapsed,
    toggleSidebarCollapsed,
  };
}
