"use client";

import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { MessagingSettingSwitch } from "@/components/messaging/MessagingSettingSwitch";
import { messagingCopy } from "@/features/messaging/messaging.copy";
import { useMessagingSettings } from "@/features/messaging/messaging.queries";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { type AccountKind } from "../types/account.types";
import { classifyAccountError } from "../utils/account-errors";
import { verificationHref } from "../utils/account-utils";
import { AccountErrorState, AccountSkeleton, InlineMessage, SectionCard } from "./AccountStateViews";

// The two privacy switches of the messaging, on its own settings routes
// (GET/PATCH /messaging/settings). The messaging is for verified accounts.
export function MessagingSection({ accountType, locale, t }: { accountType: AccountKind; locale: Locale; t: TranslationFunction }) {
  const settings = useMessagingSettings();
  const copy = messagingCopy[locale].panel;
  const [notice, setNotice] = useState<{ message: string; tone: "error" | "success" } | null>(null);

  if (settings.isLoading) return <AccountSkeleton t={t} />;

  if (settings.isError) {
    const { key } = classifyAccountError(settings.error);
    if (key === "verificationRequired") {
      return (
        <SectionCard title={t("account.messaging.title")}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" role="status">
            <p className="flex items-start gap-2 text-xs leading-5 text-[var(--text-secondary)]">
              <ShieldAlert size={16} className="mt-0.5 shrink-0 text-[var(--warning-ink)]" aria-hidden="true" />
              {t("account.messaging.unverified")}
            </p>
            <Link href={verificationHref(accountType)} className="clinical-button shrink-0">{t("account.messaging.unverifiedAction")}</Link>
          </div>
        </SectionCard>
      );
    }
    return <AccountErrorState errorKey={key} onRetry={() => void settings.refetch()} t={t} />;
  }

  const saved = () => setNotice({ message: t("account.messaging.updated"), tone: "success" });
  const failed = (error: unknown) => setNotice({ message: t(`account.errors.${classifyAccountError(error).key}`), tone: "error" });

  return (
    <SectionCard title={t("account.messaging.title")} description={t("account.messaging.subtitle")}>
      <div className="max-w-xl space-y-5">
        <MessagingSettingSwitch setting="discoverableByPeers" label={copy.discoverable} hint={copy.discoverableHint} onSaved={saved} onFailed={failed} />
        <MessagingSettingSwitch setting="shareReadReceipts" label={copy.readReceipts} hint={copy.readReceiptsHint} onSaved={saved} onFailed={failed} />
        {notice ? <InlineMessage message={notice.message} tone={notice.tone} /> : null}
      </div>
    </SectionCard>
  );
}
