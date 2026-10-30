import { FileText, Lock, TriangleAlert } from "lucide-react";
import { Notice, PageHeader, StatusBadge } from "../dashboard-ui";
import { formatDateOnly } from "../dates";
import { fr } from "../i18n/fr";
import { prescriptionStatus } from "../statuses";
import { hasPrintIdentity, printInputForPrescription, type PrintIdentity } from "../print/build-print-input";
import { PrintControls } from "../print/PrintControls";
import { renderPrescriptionHtml } from "../print/prescription-print";
import type { LocalPatient, LocalPrescription } from "../types";

// A prescription that is no longer an editable draft (validated, canceled, in
// conflict, or of a record locked out of the scope): shown, never edited. A
// validated one prints with its official number and its fingerprint.
export function PrescriptionView({ prescription, patientName, patientLocked, patient, identity }: {
  prescription: LocalPrescription;
  patientName: string;
  patientLocked: boolean;
  patient: LocalPatient | null;
  identity: PrintIdentity;
}) {
  const status = prescriptionStatus({ ...prescription, patientLocked });
  const conflict = prescription.localStatus === "CONFLICT";
  const validated = prescription.serverStatus === "VALIDATED" && Boolean(prescription.number);
  // A canceled prescription is not printed.
  const printable = prescription.serverStatus !== "CANCELED" && (validated || prescription.serverStatus !== "VALIDATED");
  const printBlock = !hasPrintIdentity(identity) ? fr.print.noIdentity : !patient ? fr.common.loading : null;
  return (
    <section className="workspace-stack" aria-label="Ordonnance en lecture seule">
      <PageHeader
        icon={<FileText className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />}
        eyebrow={`${fr.header.titles.prescription} · ${formatDateOnly(prescription.updatedAt)}`}
        title={patientName}
        description={prescription.number ? `N° ${prescription.number}` : undefined}
        actions={
          <>
            <StatusBadge label={status.label} tone={status.tone} />
            {printable ? (
              <PrintControls
                filename={validated ? `ordonnance-${prescription.number}.html` : "ordonnance-brouillon.html"}
                disabledReason={printBlock}
                prepare={async () =>
                  patient
                    ? {
                        localId: prescription.localId,
                        html: renderPrescriptionHtml(printInputForPrescription(prescription, prescription.items, patient, identity)),
                      }
                    : null
                }
              />
            ) : null}
          </>
        }
      />
      <Notice
        tone={conflict ? "danger" : "neutral"}
        icon={
          conflict
            ? <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
            : <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
        }
      >
        {conflict ? "Conflit à résoudre : l’ordonnance est conservée sur cet appareil en lecture seule." : patientLocked ? fr.consultation.lockedPatient : fr.prescription.readOnly}
      </Notice>
      <div className="surface-section overflow-hidden">
        {prescription.items.length ? (
          <ul className="divide-y divide-[var(--line)]">
            {prescription.items.map((item, index) => (
              <li key={`${item.dci}-${index}`} className="px-5 py-4 sm:px-6">
                <p className="text-sm font-semibold text-[var(--ink)]">
                  {item.dci}
                  {item.brandName ? <span className="font-normal text-[var(--ink-soft)]"> · {item.brandName}</span> : null}
                </p>
                <p className="mt-1 text-xs text-[var(--ink-soft)]">
                  {[item.strength, fr.prescription.forms[item.pharmaceuticalForm] ?? item.pharmaceuticalForm, fr.prescription.routes[item.route] ?? item.route]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="mt-1 text-xs text-[var(--ink)]">
                  {[item.dosePerIntake, item.frequency, item.durationDays ? fr.prescription.days(item.durationDays) : null, item.quantity]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {item.patientInstructions ? <p className="mt-1 text-xs text-[var(--ink-faint)]">{item.patientInstructions}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-6 py-10 text-center text-sm text-[var(--ink-faint)]">Sans médicament</p>
        )}
      </div>
    </section>
  );
}
