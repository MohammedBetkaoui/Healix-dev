"use client";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type PatientsSearchProps = {
  direction: Direction;
  onSearchChange: (value: string) => void;
  search: string;
  t: TranslationFunction;
};

export function PatientsSearch({
  direction,
  onSearchChange,
  search,
  t,
}: PatientsSearchProps) {
  return (
    <div className="relative">
      <Search
        className={cn(
          "pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground",
          direction === "rtl" ? "right-3" : "left-3",
        )}
      />
      <Input
        className={cn(
          "h-12 rounded-2xl border-border bg-card text-sm shadow-sm",
          direction === "rtl" ? "pr-10 text-right" : "pl-10",
        )}
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={t("patients.search.placeholder")}
      />
    </div>
  );
}
