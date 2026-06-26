"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { establishmentNavSections } from "@/components/dashboard/layout/navigation";
import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import {
  createEstablishmentVerificationSchema,
  isAcceptedDocumentFile,
  isDocumentSizeValid,
} from "@/lib/validations/establishment-verification.schema";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import {
  type DocumentUploadState,
  type EstablishmentVerificationFormInput,
  type RequiredDocumentDefinition,
  type RequiredDocumentType,
  type VerificationStatus,
} from "@/features/verification/types/verification.types";
import { useEstablishmentVerificationPrefill } from "@/features/verification/hooks/use-establishment-verification-prefill";
import { ESTABLISHMENT_TYPE_OPTIONS } from "@/types/auth";
import { cn } from "@/lib/utils";

import { EstablishmentInfoForm } from "./EstablishmentInfoForm";
import { RequiredDocumentsSection } from "./RequiredDocumentsSection";
import { VerificationSecurityNotice } from "./VerificationSecurityNotice";
import { VerificationStatusCard } from "./VerificationStatusCard";
import { VerificationStepper } from "./VerificationStepper";
import { VerificationSubmitPanel } from "./VerificationSubmitPanel";

const requiredDocuments: RequiredDocumentDefinition[] = [
  {
    descriptionKey: "verification.documents.items.commercialRegister.description",
    fieldName: "commercialRegisterDocument",
    titleKey: "verification.documents.items.commercialRegister.title",
    type: "COMMERCIAL_REGISTER",
  },
  {
    descriptionKey: "verification.documents.items.nif.description",
    fieldName: "nifDocument",
    titleKey: "verification.documents.items.nif.title",
    type: "NIF",
  },
  {
    descriptionKey: "verification.documents.items.healthAuthorization.description",
    fieldName: "healthAuthorizationDocument",
    titleKey: "verification.documents.items.healthAuthorization.title",
    type: "HEALTH_AUTHORIZATION",
  },
  {
    descriptionKey: "verification.documents.items.managerId.description",
    fieldName: "managerIdDocument",
    titleKey: "verification.documents.items.managerId.title",
    type: "MANAGER_ID",
  },
  {
    descriptionKey: "verification.documents.items.addressProof.description",
    fieldName: "addressProofDocument",
    titleKey: "verification.documents.items.addressProof.title",
    type: "ADDRESS_PROOF",
  },
];

const defaultValues: EstablishmentVerificationFormInput = {
  address: "",
  addressProofDocument: null,
  commercialRegisterDocument: null,
  commercialRegisterNumber: "",
  establishmentName: "",
  establishmentType: ESTABLISHMENT_TYPE_OPTIONS[0]?.value ?? "CLINIC",
  healthAuthorizationDocument: null,
  healthAuthorizationNumber: "",
  managerFullName: "",
  managerIdDocument: null,
  nif: "",
  nifDocument: null,
  phone: "",
  professionalEmail: "",
  wilaya: "",
};

function createInitialDocumentStates(): Record<RequiredDocumentType, DocumentUploadState> {
  return {
    COMMERCIAL_REGISTER: { status: "MISSING", type: "COMMERCIAL_REGISTER" },
    NIF: { status: "MISSING", type: "NIF" },
    HEALTH_AUTHORIZATION: { status: "MISSING", type: "HEALTH_AUTHORIZATION" },
    MANAGER_ID: { status: "MISSING", type: "MANAGER_ID" },
    ADDRESS_PROOF: { status: "MISSING", type: "ADDRESS_PROOF" },
  };
}

export function EstablishmentVerificationPage() {
  const { locale } = useStoredLocale();
  const { direction, t } = useTranslation(locale);
  const { data: prefillData, isError: isPrefillError, isLoading: isPrefillLoading } =
    useEstablishmentVerificationPrefill();
  const [submittedStatus, setSubmittedStatus] =
    useState<VerificationStatus | null>(null);
  const [isSubmittingRequest, setSubmittingRequest] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [documentStates, setDocumentStates] = useState<Record<
    RequiredDocumentType,
    DocumentUploadState
  >>(createInitialDocumentStates);

  const schema = useMemo(
    () =>
      createEstablishmentVerificationSchema({
        emailInvalid: t("verification.errors.emailInvalid"),
        fileTooLarge: t("verification.errors.fileTooLarge"),
        formatNotAccepted: t("verification.errors.formatNotAccepted"),
        required: t("verification.errors.required"),
      }),
    [t],
  );

  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setError,
    clearErrors,
    setValue,
    trigger,
    control,
  } = useForm<EstablishmentVerificationFormInput>({
    defaultValues,
    mode: "onBlur",
    resolver: zodResolver(schema),
  });
  const status =
    submittedStatus ?? prefillData?.verification.status ?? "NOT_STARTED";

  useEffect(() => {
    if (!prefillData) {
      return;
    }

    const establishment = prefillData.establishment;
    const draftData = prefillData.draftData;

    reset({
      ...defaultValues,
      address: draftData?.address ?? establishment.address,
      commercialRegisterNumber: draftData?.commercialRegisterNumber ?? "",
      establishmentName: draftData?.name ?? establishment.name,
      establishmentType: draftData?.type ?? establishment.type,
      healthAuthorizationNumber: draftData?.healthAuthorizationNumber ?? "",
      managerFullName:
        draftData?.legalRepresentativeFullName ?? establishment.managerFullName,
      nif: draftData?.nif ?? "",
      phone: draftData?.phone ?? establishment.phone,
      professionalEmail:
        draftData?.professionalEmail ?? establishment.professionalEmail,
      wilaya: draftData?.wilaya ?? establishment.wilaya,
    });
  }, [prefillData, reset]);

  const watchedValues = useWatch({ control });

  const infoCompletedCount = useMemo(() => {
    const infoFields = [
      watchedValues.establishmentName,
      watchedValues.establishmentType,
      watchedValues.wilaya,
      watchedValues.address,
      watchedValues.professionalEmail,
      watchedValues.phone,
      watchedValues.managerFullName,
      watchedValues.nif,
      watchedValues.commercialRegisterNumber,
      watchedValues.healthAuthorizationNumber,
    ];

    return infoFields.filter((value) => typeof value === "string" && value.trim().length > 0)
      .length;
  }, [watchedValues]);

  const documentsAddedCount = useMemo(
    () =>
      Object.values(documentStates).filter(
        (document) => document.status === "READY" || document.status === "UPLOADED",
      ).length,
    [documentStates],
  );

  const isReadyToSubmit =
    infoCompletedCount >= 8 &&
    requiredDocuments.every((document) => {
      const state = documentStates[document.type];
      return state.status === "READY" || state.status === "UPLOADED";
    });

  const handleDocumentSelect = (
    fieldName: RequiredDocumentDefinition["fieldName"],
    type: RequiredDocumentType,
    file: File | null,
  ) => {
    if (!file) {
      setValue(fieldName, null, { shouldValidate: true });
      setDocumentStates((current) => ({
        ...current,
        [type]: { status: "MISSING", type },
      }));
      return;
    }

    if (!isAcceptedDocumentFile(file)) {
      setError(fieldName, {
        message: t("verification.errors.formatNotAccepted"),
        type: "manual",
      });
      setDocumentStates((current) => ({
        ...current,
        [type]: {
          fileName: file.name,
          fileSize: file.size,
          status: "REJECTED",
          type,
        },
      }));
      return;
    }

    if (!isDocumentSizeValid(file)) {
      setError(fieldName, {
        message: t("verification.errors.fileTooLarge"),
        type: "manual",
      });
      setDocumentStates((current) => ({
        ...current,
        [type]: {
          fileName: file.name,
          fileSize: file.size,
          status: "REJECTED",
          type,
        },
      }));
      return;
    }

    clearErrors(fieldName);
    setValue(fieldName, file, { shouldValidate: true });
    setDocumentStates((current) => ({
      ...current,
      [type]: {
        fileName: file.name,
        fileSize: file.size,
        status: status === "PENDING_VERIFICATION" ? "UPLOADED" : "READY",
        type,
      },
    }));
  };

  const onSubmit = handleSubmit(async () => {
    const isValid = await trigger();

    if (!isValid || !isReadyToSubmit) {
      return;
    }

    setSubmittingRequest(true);

    try {
      // Backend validation and secure file scanning remain mandatory.
      await new Promise((resolve) => window.setTimeout(resolve, 800));
      setSubmittedStatus("PENDING_VERIFICATION");
      setToastMessage(t("verification.submit.success"));
      setDocumentStates((current) =>
        Object.fromEntries(
          Object.entries(current).map(([key, value]) => [
            key,
            { ...value, status: value.fileName ? "UPLOADED" : value.status },
          ]),
        ) as Record<RequiredDocumentType, DocumentUploadState>,
      );
      window.setTimeout(() => setToastMessage(null), 3000);
    } finally {
      setSubmittingRequest(false);
    }
  });

  return (
    <DashboardShell
      accountType="ESTABLISHMENT"
      activeKey="verification"
      breadcrumbLabel={t("verification.page.breadcrumb")}
      navSections={establishmentNavSections}
      titleKey="verification.page.title"
      user={{
        accountType: "ESTABLISHMENT",
        footerSubtitle: "Administration",
        initials: "HE",
        name: "Healix Clinique",
        roleKey: "dashboard.common.roles.establishment",
        workspaceSubtitle: "Clinique El Shifa",
      }}
    >
      {toastMessage ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "fixed top-5 z-50 flex max-w-md items-start gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-900 shadow-2xl shadow-sky-950/10",
            direction === "rtl" ? "left-5" : "right-5",
          )}
        >
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{toastMessage}</p>
        </div>
      ) : null}

      <section className="space-y-6">
        <div>
          <p className="text-sm text-slate-500">{t("verification.page.subtitle")}</p>
        </div>

        <VerificationStatusCard
          demoBadgeLabel={t("verification.status.demoBadge")}
          description={
            status === "PENDING_VERIFICATION"
              ? t("verification.status.pendingDescription")
              : t("verification.status.notStarted")
          }
          isPending={status === "PENDING_VERIFICATION"}
          onStart={() => {
            const target = document.getElementById("verification-info-section");
            target?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          startLabel={t("verification.status.start")}
          status={status}
          statusLabel={t(`verification.status.values.${status}`)}
          statusTitle={t("verification.status.current")}
          title={
            status === "PENDING_VERIFICATION"
              ? t("verification.status.pendingTitle")
              : t("verification.page.title")
          }
        />

        <VerificationStepper
          activeStep={1}
          direction={direction}
          steps={[
            t("verification.stepper.establishmentInfo"),
            t("verification.stepper.officialDocuments"),
            t("verification.stepper.submission"),
            t("verification.stepper.adminValidation"),
          ]}
        />

        <div id="verification-info-section" className="space-y-6">
          {isPrefillLoading ? (
            <div
              className="flex items-center gap-2 rounded-2xl border border-cyan-100 bg-cyan-50/70 px-4 py-3 text-sm text-cyan-900"
              role="status"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t("verification.form.prefillLoading")}</span>
            </div>
          ) : null}

          {isPrefillError ? (
            <div
              className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
              role="alert"
            >
              {t("verification.form.prefillError")}
            </div>
          ) : null}

          <EstablishmentInfoForm
            direction={direction}
            errors={errors}
            register={register}
            t={t}
          />

          <RequiredDocumentsSection
            documentStates={documentStates}
            documents={requiredDocuments}
            errors={errors}
            onFileSelect={handleDocumentSelect}
            t={t}
          />

          <VerificationSecurityNotice
            text={t("verification.security.text")}
            title={t("verification.security.title")}
          />

          <VerificationSubmitPanel
            completedInfoCount={infoCompletedCount}
            documentsAddedCount={documentsAddedCount}
            isLoading={isSubmittingRequest}
            isReady={isReadyToSubmit}
            onSubmit={onSubmit}
            statusLabel={
              isReadyToSubmit
                ? t("verification.submit.ready")
                : t("verification.submit.incomplete")
            }
            submitLabel={t("verification.submit.button")}
            submittingLabel={t("verification.submit.loading")}
            title={t("verification.submit.infoCompleted")}
          />

          <section className="rounded-[24px] border border-cyan-100 bg-cyan-50/50 p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-cyan-700 shadow-sm">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  {status === "PENDING_VERIFICATION"
                    ? t("verification.status.pendingTitle")
                    : t("verification.status.current")}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {status === "PENDING_VERIFICATION"
                    ? t("verification.status.pendingDescription")
                    : t("verification.status.notStarted")}
                </p>
              </div>
            </div>
          </section>
        </div>
      </section>
    </DashboardShell>
  );
}
