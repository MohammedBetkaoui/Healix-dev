import { AppointmentsAgendaPage } from "@/components/appointments/AppointmentsAgendaPage";
import { requireAuthenticatedPage } from "@/lib/auth/server-auth";

export default async function Page() {
  await requireAuthenticatedPage(["INDEPENDENT_DOCTOR"], "/doctor/appointments");

  return <AppointmentsAgendaPage accountType="DOCTOR" />;
}
