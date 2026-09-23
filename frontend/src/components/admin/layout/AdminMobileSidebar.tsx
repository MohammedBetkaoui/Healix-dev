"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { AdminSidebar } from "./AdminSidebar";

type AdminMobileSidebarProps = {
  adminName?: string;
  direction: Direction;
  isOpen: boolean;
  onClose: () => void;
  t: TranslationFunction;
};

export function AdminMobileSidebar({
  adminName,
  direction,
  isOpen,
  onClose,
  t,
}: AdminMobileSidebarProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label={t("admin.actions.close")}
        className="absolute inset-0 bg-[#0f172a]/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          "dashboard-chrome absolute top-0 h-full w-[82vw] max-w-[320px]",
          direction === "rtl" ? "right-0" : "left-0",
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("admin.actions.close")}
          className={cn(
            "absolute top-4 z-10 h-9 w-9",
            direction === "rtl" ? "left-4" : "right-4",
          )}
          onClick={onClose}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
        <AdminSidebar
          adminName={adminName}
          direction={direction}
          onNavigate={onClose}
          t={t}
        />
      </div>
    </div>
  );
}
