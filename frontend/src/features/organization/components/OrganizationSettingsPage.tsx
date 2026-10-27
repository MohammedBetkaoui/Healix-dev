"use client";

import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { establishmentNavSections } from "@/components/dashboard/layout/navigation";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { useEstablishmentVerificationPrefill } from "@/features/verification/hooks/use-establishment-verification-prefill";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";

import { useOrganization } from "../hooks/use-organization";
import { classifyOrganizationError } from "../utils/organization-errors";
import { ContactsSection } from "./ContactsSection";
import { DataProtectionSection } from "./DataProtectionSection";
import { IdentitySection } from "./IdentitySection";
import { LegalSection } from "./LegalSection";
import { OpeningHoursSection } from "./OpeningHoursSection";
import {
  OrganizationErrorState,
  OrganizationSkeleton,
} from "./OrganizationStateViews";

export function OrganizationSettingsPage() {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const currentUser = useCurrentUser(undefined, { enabled: true });
  const prefill = useEstablishmentVerificationPrefill({ enabled: true });
  const query = useOrganization();
  const initials = getAccountInitials(currentUser.data?.fullName);

  return (
    <DashboardShell
      accountType="ESTABLISHMENT"
      activeKey="organization"
      breadcrumbLabel={t("organization.page.breadcrumb")}
      navSections={establishmentNavSections}
      titleKey="organization.page.title"
      user={{
        accountType: "ESTABLISHMENT",
        footerSubtitle: t("dashboard.clinical.administration"),
        initials,
        name:
          currentUser.data?.fullName || t("dashboard.clinical.administration"),
        roleKey: "dashboard.common.roles.establishment",
        workspaceSubtitle:
          query.data?.identity.name ||
          prefill.data?.establishment.name ||
          t("dashboard.clinical.workspace"),
      }}
    >
      <div className="workspace-stack">
        <header>
          <p className="text-[0.7rem] font-semibold text-[var(--medical)]">
            {t("organization.page.breadcrumb")}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)] sm:text-[1.75rem]">
            {t("organization.page.title")}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
            {t("organization.page.subtitle")}
          </p>
        </header>

        {query.isLoading ? <OrganizationSkeleton t={t} /> : null}
        {!query.isLoading && (query.isError || !query.data) ? (
          <OrganizationErrorState
            errorKey={classifyOrganizationError(query.error).key}
            onRetry={() => void query.refetch()}
            t={t}
          />
        ) : null}
        {query.data ? (
          <div className="space-y-5">
            <IdentitySection organization={query.data} t={t} />
            <LegalSection locale={locale} organization={query.data} t={t} />
            <ContactsSection organization={query.data} t={t} />
            <OpeningHoursSection organization={query.data} t={t} />
            <DataProtectionSection organization={query.data} t={t} />
          </div>
        ) : null}
      </div>
    </DashboardShell>
  );
}
