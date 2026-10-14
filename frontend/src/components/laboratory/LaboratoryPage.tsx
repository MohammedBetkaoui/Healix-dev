"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPlus,
  FileCheck2,
  FlaskConical,
  Microscope,
  ShieldCheck,
  Syringe,
  TestTubes,
} from "lucide-react";
import { useState } from "react";

import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { establishmentNavSections } from "@/components/dashboard/layout/navigation";
import { LabRequestDrawer, type LabDrawerAction } from "@/components/laboratory/LabRequestDrawer";
import { LabRequestRegistry } from "@/components/laboratory/LabRequestRegistry";
import { NewLabRequestModal } from "@/components/laboratory/NewLabRequestModal";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { laboratoryCopy } from "@/features/laboratory/laboratory.copy";
import { mockLabRequests } from "@/features/laboratory/laboratory.mock";
import { type LabCategory, type LabRequest, type LabResult } from "@/features/laboratory/laboratory.types";
import { useEstablishmentVerificationPrefill } from "@/features/verification/hooks/use-establishment-verification-prefill";
import { type Locale } from "@/i18n";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function formatDateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function defaultResults(category: LabCategory): LabResult[] {
  if (category === "HEMATOLOGY") {
    return [
      { id: `mock-hb-${Date.now()}`, indicator: "NORMAL", parameter: { ar: "الهيموغلوبين", fr: "Hémoglobine" }, reference: "12,0 – 16,0", unit: "g/dL", value: "13,4" },
      { id: `mock-wbc-${Date.now()}`, indicator: "NORMAL", parameter: { ar: "الكريات البيضاء", fr: "Leucocytes" }, reference: "4,0 – 10,0", unit: "G/L", value: "7,8" },
    ];
  }
  if (category === "BIOCHEMISTRY") {
    return [
      { id: `mock-gly-${Date.now()}`, indicator: "NORMAL", parameter: { ar: "سكر الدم", fr: "Glycémie" }, reference: "0,70 – 1,10", unit: "g/L", value: "0,94" },
      { id: `mock-crea-${Date.now()}`, indicator: "NORMAL", parameter: { ar: "الكرياتينين", fr: "Créatinine" }, reference: "6 – 12", unit: "mg/L", value: "8,6" },
    ];
  }
  return [
    { id: `mock-result-${Date.now()}`, indicator: "NORMAL", parameter: { ar: "المؤشر المطلوب", fr: "Paramètre demandé" }, reference: "Selon méthode", unit: "—", value: "Conforme" },
  ];
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

export function LaboratoryPage() {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const copy = laboratoryCopy[locale];
  const currentUser = useCurrentUser(undefined, { enabled: true });
  const prefill = useEstablishmentVerificationPrefill();
  const [requests, setRequests] = useState<LabRequest[]>(mockLabRequests);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const selectedRequest = requests.find((request) => request.id === selectedId) ?? null;

  const todayCount = requests.filter((request) => dateKey(new Date(request.createdAt)) === dateKey(new Date())).length;
  const toCollectCount = requests.filter((request) => request.status === "PRESCRIBED" || request.status === "TO_COLLECT").length;
  const inAnalysisCount = requests.filter((request) => request.status === "IN_ANALYSIS").length;
  const toValidateCount = requests.filter((request) => request.status === "TO_VALIDATE").length;
  const criticalCount = requests.filter((request) => request.results.some((result) => result.indicator === "CRITICAL")).length;

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  };

  const createRequest = (request: LabRequest) => {
    setRequests((current) => [request, ...current]);
    setCreateOpen(false);
    setSelectedId(request.id);
    showNotice(copy.modal.created);
  };

  const applyDrawerAction = (action: LabDrawerAction) => {
    if (!selectedRequest) return;
    const now = new Date().toISOString();
    let message: string = copy.drawer.actionDone;

    setRequests((current) => current.map((request) => {
      if (request.id !== selectedRequest.id) return request;
      if (action === "collect") {
        return {
          ...request,
          sample: { ...request.sample, collectedAt: now, collectedBy: { ar: "نسيمة فرحات · ممرضة", fr: "Nassima Ferhat · Infirmière" } },
          status: "COLLECTED",
          trace: [{ id: `trace-${Date.now()}`, date: now, title: { ar: "تم تسجيل العينة", fr: "Prélèvement enregistré" }, detail: { ar: "تم تعريف العينة وهي جاهزة للتحويل إلى المخبر.", fr: "Échantillon identifié et prêt au transfert vers le laboratoire." }, actor: { ar: "نسيمة فرحات", fr: "Nassima Ferhat" } }, ...request.trace],
        };
      }
      if (action === "nonConforming") {
        return {
          ...request,
          labComment: { ar: "لم تُنشر أي نتيجة لهذه العينة.", fr: "Aucun résultat publié sur cet échantillon." },
          sample: { ...request.sample, conformity: "NON_CONFORMING", conformityComment: { ar: "عدم مطابقة مسجل. يلزم أخذ عينة جديدة.", fr: "Non-conformité enregistrée. Nouveau prélèvement requis." } },
          status: "NON_CONFORMING",
          trace: [{ id: `trace-${Date.now()}`, date: now, title: { ar: "تم التبليغ عن عدم المطابقة", fr: "Non-conformité signalée" }, detail: { ar: "تم إبلاغ المصلحة الواصفة وطلب عينة جديدة.", fr: "Service prescripteur informé et recollecte demandée." }, actor: { ar: "فريق المخبر", fr: "Équipe laboratoire" } }, ...request.trace],
        };
      }
      if (action === "enterResults") {
        message = copy.drawer.resultsEntered;
        return {
          ...request,
          enteredBy: { ar: "السيدة رانيا قاسي · أخصائية بيولوجيا", fr: "Mme Rania Kaci · Biologiste" },
          labComment: { ar: "اكتملت المراقبة التقنية. النتائج بانتظار المصادقة الطبية.", fr: "Contrôle technique terminé. Résultats en attente de validation médicale." },
          results: request.results.length ? request.results : defaultResults(request.category),
          sample: { ...request.sample, conformity: "CONFORMING", receivedAt: request.sample.receivedAt || now },
          status: "TO_VALIDATE",
          trace: [{ id: `trace-${Date.now()}`, date: now, title: { ar: "تم إدخال النتائج", fr: "Résultats saisis" }, detail: { ar: "تمت المراقبة التقنية وأُرسل التقرير للمصادقة.", fr: "Contrôle technique effectué et compte rendu transmis pour validation." }, actor: { ar: "السيدة رانيا قاسي", fr: "Mme Rania Kaci" } }, ...request.trace],
        };
      }

      message = copy.drawer.validated;
      return {
        ...request,
        status: "AVAILABLE",
        validation: { date: now, practitioner: { ar: "د. ليلى منصوري · طبيبة بيولوجية", fr: "Dr Leïla Mansouri · Médecin biologiste" } },
        trace: [
          { id: `trace-published-${Date.now()}`, date: now, title: { ar: "النتيجة متاحة", fr: "Résultat disponible" }, detail: { ar: "تم نشر التقرير في ملف المريض.", fr: "Compte rendu publié dans le dossier patient." }, actor: { ar: "نظام المخبر", fr: "Système laboratoire" } },
          { id: `trace-validated-${Date.now()}`, date: now, title: { ar: "المصادقة الطبية", fr: "Validation médicale" }, detail: { ar: "تمت المصادقة النهائية على التقرير.", fr: "Compte rendu validé définitivement." }, actor: { ar: "د. ليلى منصوري", fr: "Dr Leïla Mansouri" } },
          ...request.trace,
        ],
      };
    }));
    showNotice(message);
  };

  const openPrintableReport = () => {
    if (!selectedRequest) return;
    const report = window.open("", "_blank", "width=920,height=760");
    if (!report) return;
    report.opener = null;
    const patient = escapeHtml(`${selectedRequest.patient.firstName} ${selectedRequest.patient.lastName}`);
    const resultLabels = { CRITICAL: copy.drawer.critical, HIGH: copy.drawer.high, LOW: copy.drawer.low, NORMAL: copy.drawer.normal };
    const rows = selectedRequest.results.map((result) => `<tr><td>${escapeHtml(result.parameter.fr)}</td><td><strong>${escapeHtml(result.value)}</strong></td><td>${escapeHtml(result.unit)}</td><td>${escapeHtml(result.reference)}</td><td>${escapeHtml(resultLabels[result.indicator])}</td></tr>`).join("");
    const reference = escapeHtml(selectedRequest.reference);
    const recordNumber = escapeHtml(selectedRequest.patient.internalRecordNumber);
    const doctor = escapeHtml(selectedRequest.doctor.fr);
    const service = escapeHtml(selectedRequest.service.fr);
    const comment = escapeHtml(selectedRequest.labComment?.fr ?? "");
    const practitioner = escapeHtml(selectedRequest.validation?.practitioner.fr ?? "—");
    report.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${reference}</title><style>body{font:14px Arial,sans-serif;color:#17211d;margin:40px}header{border-bottom:2px solid #176b57;padding-bottom:18px;margin-bottom:24px}h1{font-size:22px;margin:0 0 6px}.meta{color:#53635c}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{border:1px solid #d8dfdb;padding:9px;text-align:left}th{background:#f5f7f5;font-size:12px}.signature{margin-top:30px;padding-top:16px;border-top:1px solid #d8dfdb}@media print{button{display:none}}</style></head><body><header><h1>HealixDz · Compte rendu de laboratoire</h1><div class="meta">${reference} · ${escapeHtml(formatDateTime(selectedRequest.createdAt, "fr"))}</div></header><h2>${patient}</h2><p>Dossier établissement : ${recordNumber}</p><p>Prescripteur : ${doctor} · ${service}</p><table><thead><tr><th>Paramètre</th><th>Résultat</th><th>Unité</th><th>Référence</th><th>Interprétation</th></tr></thead><tbody>${rows}</tbody></table><p>${comment}</p><div class="signature"><strong>Validation :</strong> ${practitioner}<br>${selectedRequest.validation ? escapeHtml(formatDateTime(selectedRequest.validation.date, "fr")) : ""}</div><p class="meta">Document mock généré localement — aucune donnée transmise à un serveur.</p><button onclick="window.print()">Imprimer / enregistrer en PDF</button></body></html>`);
    report.document.close();
    showNotice(copy.drawer.pdfGenerated);
  };

  const initials = getAccountInitials(currentUser.data?.fullName);
  const shellProps = {
    accountType: "ESTABLISHMENT" as const,
    navSections: establishmentNavSections,
    titleKey: "dashboard.clinical.nav.lab",
    user: {
      accountType: "ESTABLISHMENT" as const,
      footerSubtitle: t("dashboard.clinical.administration"),
      initials,
      name: currentUser.data?.fullName || t("dashboard.clinical.administration"),
      roleKey: "dashboard.common.roles.establishment",
      workspaceSubtitle: prefill.data?.establishment.name || t("dashboard.clinical.workspace"),
    },
  };

  const metrics = [
    { icon: ClipboardPlus, label: copy.todayRequests, value: todayCount, tone: "medical" },
    { icon: Syringe, label: copy.toCollectMetric, value: toCollectCount, tone: "medical" },
    { icon: Microscope, label: copy.inAnalysisMetric, value: inAnalysisCount, tone: "medical" },
    { icon: FileCheck2, label: copy.toValidateMetric, value: toValidateCount, tone: "warning" },
    { icon: AlertTriangle, label: copy.criticalMetric, value: criticalCount, tone: "danger" },
  ];

  return (
    <DashboardShell {...shellProps} activeKey="lab">
      <div className="space-y-6">
        {notice ? <div className="surface-raised fixed end-6 top-24 z-[110] flex items-center gap-2.5 border-[var(--success-line)] px-4 py-3 text-sm font-medium text-[var(--ink)]" role="status"><CheckCircle2 className="h-4 w-4 text-[var(--success-ink)]" strokeWidth={1.8} aria-hidden="true" />{notice}</div> : null}

        <section className="surface-section surface-raised relative overflow-hidden border-t-2 border-t-[var(--medical)]">
          <div className="grid gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:px-7">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--medical-soft)] text-[var(--medical)] ring-1 ring-[var(--accent-line)]"><FlaskConical className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" /></span>
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[var(--medical)]"><ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />{copy.badge}</span>
                <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-[var(--ink)] sm:text-[1.75rem]">{copy.title}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-soft)]">{copy.subtitle}</p>
                <p className="mt-3 inline-flex max-w-full items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-2 text-xs text-[var(--ink-soft)]"><TestTubes className="h-3.5 w-3.5 shrink-0 text-[var(--medical)]" aria-hidden="true" />{copy.workflow}</p>
              </div>
            </div>
            <Button className="lg:justify-self-end" onClick={() => setCreateOpen(true)}><ClipboardPlus className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{copy.newRequest}</Button>
          </div>
          <dl className="grid border-t border-[var(--line)] bg-[var(--panel-soft)] sm:grid-cols-2 xl:grid-cols-5">
            {metrics.map((metric, index) => (
              <div key={metric.label} className={cn("flex items-center gap-3 px-5 py-4", index > 0 && "border-t border-[var(--line)] sm:border-s", index === 2 && "sm:border-s-0 xl:border-s", index > 1 && "sm:border-t xl:border-t-0")}>
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] ring-1", metric.tone === "danger" ? "bg-[var(--danger-soft)] text-[var(--danger-ink)] ring-[var(--danger-line)]" : metric.tone === "warning" ? "bg-[var(--warning-soft)] text-[var(--warning-ink)] ring-[var(--warning-line)]" : "bg-[var(--panel)] text-[var(--medical)] ring-[var(--line)]")}><metric.icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /></span>
                <div><dt className="text-xs leading-4 text-[var(--ink-faint)]">{metric.label}</dt><dd className="clinical-figure mt-0.5 text-lg font-semibold text-[var(--ink)]">{metric.value}</dd></div>
              </div>
            ))}
          </dl>
        </section>

        <LabRequestRegistry locale={locale} onSelect={setSelectedId} requests={requests} />
      </div>

      {selectedRequest ? <LabRequestDrawer locale={locale} onAction={applyDrawerAction} onClose={() => setSelectedId(null)} onOpenReport={openPrintableReport} request={selectedRequest} /> : null}
      {isCreateOpen ? <NewLabRequestModal authorName={currentUser.data?.fullName || t("dashboard.clinical.administration")} locale={locale} onClose={() => setCreateOpen(false)} onCreate={createRequest} requests={requests} /> : null}
    </DashboardShell>
  );
}
