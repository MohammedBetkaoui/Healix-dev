import type { Metadata } from "next";

import { InviteAcceptPage } from "@/features/team/components/InviteAcceptPage";
import { teamFr } from "@/i18n/locales/fr/team";

export const metadata: Metadata = {
  title: teamFr.invite.page.title,
  description: teamFr.invite.page.subtitle,
  // The address carries the invitation token until the page cleans it: it
  // must never leave in a Referer header.
  referrer: "no-referrer",
  robots: { follow: false, index: false },
};

export default function InviteAcceptRoute() {
  return <InviteAcceptPage />;
}
