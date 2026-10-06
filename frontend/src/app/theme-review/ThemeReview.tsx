"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AdminDashboardPage } from "@/components/admin/dashboard/AdminDashboardPage";
import { AdminPaymentsPage } from "@/components/admin/payments/AdminPaymentsPage";
import { AiAnalysesHubPage } from "@/components/ai-analyses/AiAnalysesHubPage";
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
    // GET /subscription/plans, establishment plans from backend/prisma/seed.ts,
    // in the order MariaDB returns them (monthlyPrice ASC puts NULL first).
    const plan = (code: string, name: string, monthlyPrice: number | null, annualPrice: number | null, description: string, features: string[], limits: string[], flags: { custom?: boolean; recommended?: boolean } = {}) => ({
      accountType: "ESTABLISHMENT", annualPrice, code, currency: "DZD", custom: flags.custom ?? false, description, features, id: `preview-${code}`, limits, monthlyPrice, name, recommended: flags.recommended ?? false,
    });
    query.setQueryData(["subscription", "plans"], [
      plan("EST_CUSTOM", "Custom", null, null, "Pour hopital, reseau multi-sites ou integration specifique.", ["Offre personnalisee", "Multi-sites", "Integration HL7/FHIR", "Support dedie", "SLA personnalise", "Accompagnement technique"], ["Sur devis"], { custom: true }),
      plan("EST_BASIC_CLINIC", "Basic Clinic", 14900, 149000, "Pour petite clinique, cabinet de groupe ou centre medical debutant.", ["Dashboard etablissement", "Gestion des patients", "Gestion des medecins affilies", "Rapports medicaux", "Analyses IA limitees", "Support standard"], ["5 medecins", "500 patients", "100 analyses IA / mois", "1 etablissement"]),
      plan("EST_PRO_CENTER", "Pro Center", 29900, 299000, "Pour centre medical, laboratoire ou centre d'imagerie avec activite reguliere.", ["Toutes les fonctionnalites Basic Clinic", "Medecins affilies etendus", "Patients illimites", "Analyses IA avancees", "Rapports detailles", "Support prioritaire"], ["20 medecins", "Patients illimites", "500 analyses IA / mois", "3 services medicaux"], { recommended: true }),
      plan("EST_ENTERPRISE", "Enterprise", 59900, 599000, "Pour grand etablissement avec plusieurs medecins, services ou volumes eleves.", ["Toutes les fonctionnalites Pro Center", "IA premium", "Gestion avancee des roles", "Audit logs avances", "Support premium", "Preparation HL7/FHIR"], ["100 medecins", "Patients illimites", "2 000 analyses IA / mois", "Multi-services"]),
    ]);
    // GET /admin/payments (+ one detail) shapes, for the admin-payments view.
    // Key must equal AdminPaymentsPage's initial query ({ limit: 20, page: 1 }).
    const payments = [
      { id: "pay-1", reference: "HLX-PAY-2026-0142", userName: "Clinique Démonstration", userEmail: "contact@clinique-demo.dz", userPhone: "0550 12 34 56", userRole: "ESTABLISHMENT_ADMIN", accountType: "ESTABLISHMENT", plan: { id: "p1", name: "Pro Center", code: "EST_PRO_CENTER" }, amount: 299000, currency: "DZD", billingPeriod: "ANNUAL", method: "MANUAL_POST_TRANSFER", status: "WAITING_ADMIN_REVIEW", createdAt: "2026-10-02T09:14:00.000Z", proof: { id: "pr1", documentType: "PAYMENT_PROOF", originalName: "recu-ccp-octobre.pdf", mimeType: "application/pdf", size: 182000, uploadedAt: "2026-10-02T09:20:00.000Z" } },
      { id: "pay-2", reference: "HLX-PAY-2026-0141", userName: "Dr Exemple", userEmail: "dr.exemple@healix.dz", userPhone: "0661 98 76 54", userRole: "INDEPENDENT_DOCTOR", accountType: "INDEPENDENT_DOCTOR", plan: { id: "p2", name: "Pro", code: "DOCTOR_PRO" }, amount: 5900, currency: "DZD", billingPeriod: "MONTHLY", method: "SYNTHETIC_CHARGILY", status: "PAID", createdAt: "2026-10-01T16:40:00.000Z", proof: null },
      { id: "pay-3", reference: "HLX-PAY-2026-0139", userName: "Établissement Test", userEmail: "admin@etab-test.dz", userPhone: "0770 11 22 33", userRole: "ESTABLISHMENT_ADMIN", accountType: "ESTABLISHMENT", plan: { id: "p3", name: "Basic Clinic", code: "EST_BASIC_CLINIC" }, amount: 14900, currency: "DZD", billingPeriod: "MONTHLY", method: "BARIDIMOB_RECEIPT", status: "REJECTED", createdAt: "2026-09-29T11:05:00.000Z", proof: null },
    ];
    query.setQueryData(["admin", "payments", { limit: 20, page: 1 }], { data: payments, meta: { page: 1, limit: 20, total: 3, totalPages: 1 } });
    query.setQueryData(["admin", "payments", "detail", "pay-1"], {
      ...payments[0], provider: null, providerStatus: null, cardLast4: null, cardHolderName: null, paidAt: null, reviewedAt: null, adminNote: "Virement vérifié sur le relevé CCP, en attente de rapprochement.", rejectionReason: null, updatedAt: "2026-10-02T09:20:00.000Z",
      user: { id: "u1", accountStatus: "VERIFIED_NO_PLAN", email: "contact@clinique-demo.dz", fullName: "Clinique Démonstration", phone: "0550 12 34 56", role: "ESTABLISHMENT_ADMIN" },
      plan: { id: "p1", name: "Pro Center", code: "EST_PRO_CENTER", accountType: "ESTABLISHMENT" }, subscription: null,
    });
    return query;
  });
  return <QueryClientProvider client={client}>{view === "admin" ? <AdminDashboardPage /> : view === "admin-payments" ? <AdminPaymentsPage /> : view === "doctor" ? <DoctorDashboard /> : view === "patients" ? <EstablishmentPatientsPage /> : view === "appointments" ? <AppointmentsAgendaPage accountType="ESTABLISHMENT" /> : view === "verification" ? <EstablishmentVerificationPage /> : view === "subscription" ? <SubscriptionPage accountType="ESTABLISHMENT" /> : view === "ai-analyses" ? <AiAnalysesHubPage accountType="ESTABLISHMENT" /> : <EstablishmentDashboard />}</QueryClientProvider>;
}
