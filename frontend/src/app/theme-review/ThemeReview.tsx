"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AdminDashboardPage } from "@/components/admin/dashboard/AdminDashboardPage";
import { EstablishmentDashboard } from "@/components/dashboard/establishment/EstablishmentDashboard";
import { DoctorDashboard } from "@/components/dashboard/doctor/DoctorDashboard";
import { EstablishmentPatientsPage } from "@/components/dashboard/establishment/EstablishmentPatientsPage";
import { EstablishmentVerificationPage } from "@/components/verification/establishment/EstablishmentVerificationPage";
import { SubscriptionPage } from "@/components/subscription/SubscriptionPage";

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
    return query;
  });
  return <QueryClientProvider client={client}>{view === "admin" ? <AdminDashboardPage /> : view === "doctor" ? <DoctorDashboard /> : view === "patients" ? <EstablishmentPatientsPage /> : view === "verification" ? <EstablishmentVerificationPage /> : view === "subscription" ? <SubscriptionPage accountType="ESTABLISHMENT" /> : <EstablishmentDashboard />}</QueryClientProvider>;
}
