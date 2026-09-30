"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AdminDashboardPage } from "@/components/admin/dashboard/AdminDashboardPage";
import { AppointmentsAgendaPage } from "@/components/appointments/AppointmentsAgendaPage";
import { EstablishmentDashboard } from "@/components/dashboard/establishment/EstablishmentDashboard";
import { DoctorDashboard } from "@/components/dashboard/doctor/DoctorDashboard";
import { EstablishmentPatientsPage } from "@/components/dashboard/establishment/EstablishmentPatientsPage";
import { EstablishmentVerificationPage } from "@/components/verification/establishment/EstablishmentVerificationPage";
import { SubscriptionPage } from "@/components/subscription/SubscriptionPage";
import { getMockPatients } from "@/data/patients.mock";
import { type Appointment, type AppointmentStatus } from "@/features/appointments/appointments.types";

// Seeds today's agenda under the exact query key AppointmentsAgendaPage builds
// (local midnight → next local midnight − 1 ms).
function seedAppointmentsPreview(query: QueryClient) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const range = { from: start.toISOString(), to: new Date(end.getTime() - 1).toISOString() };
  const doctors = [
    { id: "doctor-1", fullName: "Dr Amel Benaïssa", speciality: "Cardiologie" },
    { id: "doctor-2", fullName: "Dr Samir Bouzid", speciality: "Médecine générale" },
    { id: "doctor-3", fullName: "Dr Leïla Achour", speciality: "Neurologie" },
  ];
  const rows: Array<[number, number, number, AppointmentStatus, string, string, string, string, string, number]> = [
    [8, 30, 30, "COMPLETED", "Nadia", "Mansouri", "نادية", "منصوري", "Consultation de suivi", 0],
    [9, 0, 20, "COMPLETED", "Karim", "Belkacem", "كريم", "بلقاسم", "Renouvellement d’ordonnance", 1],
    [9, 40, 30, "NO_SHOW", "Lina", "Boudiaf", "لينا", "بوضياف", "Bilan cardiologique", 0],
    [10, 30, 45, "CONFIRMED", "Mohamed", "Ben Ali", "محمد", "بن علي", "Première consultation", 2],
    [11, 15, 30, "CANCELED", "Sofia", "Haddad", "صوفيا", "حداد", "Contrôle post-opératoire", 1],
    [14, 0, 30, "CONFIRMED", "Yacine", "Ferhat", "ياسين", "فرحات", "Lecture IRM cérébrale", 2],
    [15, 30, 60, "SCHEDULED", "Meriem", "Dahmani", "مريم", "دحماني", "Bilan annuel", 0],
    [17, 0, 20, "SCHEDULED", "Riad", "Hamdi", "رياض", "حمدي", "Résultats d’analyses", 1],
  ];
  const appointments: Appointment[] = rows.map(([hours, minutes, duration, status, firstName, lastName, firstNameAr, lastNameAr, reason, doctorIndex], index) => ({
    consultationId: status === "COMPLETED" ? `consultation-${index}` : null,
    createdAt: start.toISOString(),
    createdById: "preview",
    doctorFullName: doctors[doctorIndex].fullName,
    doctorProfileId: doctors[doctorIndex].id,
    durationMinutes: duration,
    id: `appointment-${index}`,
    notes: null,
    patientFirstName: firstName,
    patientFirstNameAr: firstNameAr,
    patientId: `patient-${index}`,
    patientLastName: lastName,
    patientLastNameAr: lastNameAr,
    reason,
    scheduledAt: new Date(start.getFullYear(), start.getMonth(), start.getDate(), hours, minutes).toISOString(),
    status,
    updatedAt: start.toISOString(),
  }));
  const patients = getMockPatients("fr");
  query.setQueryData(["appointments", "list", range], appointments);
  query.setQueryData(["appointments", "doctors"], doctors);
  query.setQueryData(["patients", "list", { limit: 100 }], { data: patients, meta: { limit: 100, page: 1, total: patients.length, totalPages: 1 } });
}

export function ThemeReview({ view }: { view: string }) {
  const [client] = useState(() => {
    const query = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false, staleTime: Infinity } } });
    query.setQueryData(["auth", "me"], {
      id: "preview",
      role: view === "doctor" ? "INDEPENDENT_DOCTOR" : "ESTABLISHMENT_ADMIN",
      fullName: view === "doctor" ? "Dr Démonstration" : "Clinique Démonstration",
      accountStatus: "PENDING_VERIFICATION",
      verificationStatus: "PENDING_VERIFICATION",
    });
    query.setQueryData(["admin-auth", "me"], { id: "preview", role: "SUPER_ADMIN", fullName: "Administration Démonstration", email: "preview@example.invalid" });
    query.setQueryData(["admin", "dashboard", "overview"], {
      stats: { pendingVerifications: 12, verifiedRequests: 48, rejectedRequests: 3, totalUsers: 164, establishments: 64, independentDoctors: 100 },
      usersDistribution: { establishments: 64, independentDoctors: 100 },
      weeklyVerificationActivity: Array.from({ length: 7 }, (_, i) => ({ date: `2026-09-${17 + i}`, pending: 4 + i, verified: 12 - i, rejected: i % 3 })),
      recentVerificationRequests: ["PENDING_VERIFICATION", "VERIFIED", "REJECTED"].map((status, i) => ({ id: `preview-${i}`, requesterName: ["Clinique Démonstration", "Dr Exemple", "Établissement Test"][i], type: i === 1 ? "INDEPENDENT_DOCTOR" : "ESTABLISHMENT", status, wilaya: "Alger" })),
    });
    seedAppointmentsPreview(query);
    // GET /subscription/me shape (features/subscriptions/subscriptions.api.ts):
    // an active establishment on a catalog plan, the richest page state.
    query.setQueryData(["subscription", "me"], {
      accountStatus: "ACTIVE",
      accountType: "ESTABLISHMENT",
      subscriptionStatus: "ACTIVE",
      verificationStatus: "VERIFIED",
      currentSubscription: {
        id: "preview-subscription",
        status: "ACTIVE",
        billingPeriod: "ANNUAL",
        startedAt: "2026-03-01T09:00:00.000Z",
        expiresAt: "2027-03-01T09:00:00.000Z",
        plan: { id: "preview-plan", name: "Pro Center", code: "EST_PRO_CENTER", monthlyPrice: 45000, annualPrice: 450000, currency: "DZD" },
      },
    });
    return query;
  });
  return <QueryClientProvider client={client}>{view === "admin" ? <AdminDashboardPage /> : view === "doctor" ? <DoctorDashboard /> : view === "patients" ? <EstablishmentPatientsPage /> : view === "appointments" ? <AppointmentsAgendaPage accountType="ESTABLISHMENT" /> : view === "verification" ? <EstablishmentVerificationPage /> : view === "subscription" ? <SubscriptionPage accountType="ESTABLISHMENT" /> : <EstablishmentDashboard />}</QueryClientProvider>;
}
