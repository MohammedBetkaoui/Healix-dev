import { AppointmentsAgendaPage } from "@/components/appointments/AppointmentsAgendaPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(
    ["ESTABLISHMENT_ADMIN"],
    "/establishment/appointments",
  );

  return <AppointmentsAgendaPage accountType="ESTABLISHMENT" />;
}
