"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Info, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { doctorNavSections } from "@/components/dashboard/layout/navigation";
import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  createDoctorVerificationSchema,
  isAcceptedDoctorDocumentFile,
  isDoctorDocumentSizeValid,
} from "@/lib/validations/doctor-verification.schema";
import {
  type DoctorDocumentDefinition,
  type DoctorDocumentType,
  type DoctorDocumentUploadState,
  type DoctorVerificationFormInput,
  type DoctorVerificationStep,
  type VerificationStatus,
} from "@/features/verification/types/doctor-verification.types";

import { DoctorFiscalSocialStep } from "./steps/DoctorFiscalSocialStep";
import { DoctorIdentityStep } from "./steps/DoctorIdentityStep";
import { DoctorPracticeLocationStep } from "./steps/DoctorPracticeLocationStep";
import { DoctorProfessionalRegistrationStep } from "./steps/DoctorProfessionalRegistrationStep";
import { DoctorQualificationStep } from "./steps/DoctorQualificationStep";
import { DoctorSubmissionStep } from "./steps/DoctorSubmissionStep";
import { DoctorVerificationNavigation } from "./DoctorVerificationNavigation";
import { DoctorVerificationSecurityNotice } from "./DoctorVerificationSecurityNotice";
import { DoctorVerificationStatusCard } from "./DoctorVerificationStatusCard";
import { DoctorVerificationStepper } from "./DoctorVerificationStepper";

const doctorVerificationSteps: DoctorVerificationStep[] = [
  {
    fields: [
      "fullName",
      "birthDate",
      "birthPlace",
      "nationality",
      "identityNumber",
      "identityDocumentType",
      "phone",
      "professionalEmail",
      "wilaya",
      "commune",
      "personalOrProfessionalAddress",
    ],
    id: "IDENTITY",
    labelKey: "doctorVerification.steps.identity",
    shortLabelKey: "doctorVerification.steps.short.identity",
  },
  {
    fields: [
      "doctorType",
      "speciality",
      "primaryDegree",
      "university",
      "graduationYear",
      "specialityDegree",
      "specialityGraduationYear",
    ],
    id: "QUALIFICATION",
    labelKey: "doctorVerification.steps.qualification",
    shortLabelKey: "doctorVerification.steps.short.qualification",
  },
  {
    fields: [
      "ordreRegistrationNumber",
      "regionalCouncil",
      "registrationWilaya",
      "registrationDate",
      "professionalStatus",
      "practiceAuthorizationNumber",
      "issuingAuthority",
    ],
    id: "PROFESSIONAL_REGISTRATION",
    labelKey: "doctorVerification.steps.professionalRegistration",
    shortLabelKey: "doctorVerification.steps.short.professionalRegistration",
  },
  {
    fields: [
      "cabinetName",
      "cabinetType",
      "cabinetAddress",
      "cabinetWilaya",
      "cabinetCommune",
      "cabinetPhone",
      "cabinetEmail",
      "healthDirectorate",
      "cabinetOpeningAuthorizationNumber",
    ],
    id: "PRACTICE_LOCATION",
    labelKey: "doctorVerification.steps.practiceLocation",
    shortLabelKey: "doctorVerification.steps.short.practiceLocation",
  },
  {
    fields: [
      "nif",
      "taxCenter",
      "casnosNumber",
      "fiscalActivityType",
      "professionalRib",
    ],
    id: "FISCAL_SOCIAL",
    labelKey: "doctorVerification.steps.fiscalSocial",
    shortLabelKey: "doctorVerification.steps.short.fiscalSocial",
  },
  {
    fields: [
      "identityDocument",
      "medicalDegreeDocument",
      "specialityDegreeDocument",
      "ordreRegistrationDocument",
      "practiceAuthorizationDocument",
      "cabinetAddressProofDocument",
      "nifDocument",
      "casnosCertificateDocument",
      "cabinetOpeningAuthorizationDocument",
      "professionalPhotoDocument",
      "stampSignatureDocument",
      "cabinetOwnershipOrRentalDocument",
      "goodStandingCertificateDocument",
      "confirmAuthenticity",
      "doctorType",
    ],
    id: "DOCUMENTS_SUBMISSION",
    labelKey: "doctorVerification.steps.documentsSubmission",
    shortLabelKey: "doctorVerification.steps.short.documentsSubmission",
  },
];

const doctorDocuments: DoctorDocumentDefinition[] = [
  {
    descriptionKey: "doctorVerification.documents.items.identityDocument.description",
    fieldName: "identityDocument",
    required: true,
    titleKey: "doctorVerification.documents.items.identityDocument.title",
    type: "IDENTITY_DOCUMENT",
  },
  {
    descriptionKey: "doctorVerification.documents.items.medicalDegree.description",
    fieldName: "medicalDegreeDocument",
    required: true,
    titleKey: "doctorVerification.documents.items.medicalDegree.title",
    type: "MEDICAL_DEGREE",
  },
  {
    descriptionKey: "doctorVerification.documents.items.specialityDegree.description",
    fieldName: "specialityDegreeDocument",
    required: false,
    titleKey: "doctorVerification.documents.items.specialityDegree.title",
    type: "SPECIALITY_DEGREE",
  },
  {
    descriptionKey: "doctorVerification.documents.items.ordreRegistration.description",
    fieldName: "ordreRegistrationDocument",
    required: true,
    titleKey: "doctorVerification.documents.items.ordreRegistration.title",
    type: "ORDRE_REGISTRATION",
  },
  {
    descriptionKey: "doctorVerification.documents.items.practiceAuthorization.description",
    fieldName: "practiceAuthorizationDocument",
    required: true,
    titleKey: "doctorVerification.documents.items.practiceAuthorization.title",
    type: "PRACTICE_AUTHORIZATION",
  },
  {
    descriptionKey: "doctorVerification.documents.items.cabinetAddressProof.description",
    fieldName: "cabinetAddressProofDocument",
    required: true,
    titleKey: "doctorVerification.documents.items.cabinetAddressProof.title",
    type: "CABINET_ADDRESS_PROOF",
  },
  {
    descriptionKey: "doctorVerification.documents.items.nifDocument.description",
    fieldName: "nifDocument",
    required: true,
    titleKey: "doctorVerification.documents.items.nifDocument.title",
    type: "NIF_DOCUMENT",
  },
  {
    descriptionKey: "doctorVerification.documents.items.casnosCertificate.description",
    fieldName: "casnosCertificateDocument",
    required: false,
    titleKey: "doctorVerification.documents.items.casnosCertificate.title",
    type: "CASNOS_CERTIFICATE",
  },
  {
    descriptionKey:
      "doctorVerification.documents.items.cabinetOpeningAuthorization.description",
    fieldName: "cabinetOpeningAuthorizationDocument",
    required: false,
    titleKey:
      "doctorVerification.documents.items.cabinetOpeningAuthorization.title",
    type: "CABINET_OPENING_AUTHORIZATION",
  },
  {
    descriptionKey: "doctorVerification.documents.items.professionalPhoto.description",
    fieldName: "professionalPhotoDocument",
    required: false,
    titleKey: "doctorVerification.documents.items.professionalPhoto.title",
    type: "PROFESSIONAL_PHOTO",
  },
  {
    descriptionKey: "doctorVerification.documents.items.stampSignature.description",
    fieldName: "stampSignatureDocument",
    required: false,
    titleKey: "doctorVerification.documents.items.stampSignature.title",
    type: "STAMP_SIGNATURE",
  },
  {
    descriptionKey:
      "doctorVerification.documents.items.cabinetOwnershipOrRental.description",
    fieldName: "cabinetOwnershipOrRentalDocument",
    required: false,
    titleKey: "doctorVerification.documents.items.cabinetOwnershipOrRental.title",
    type: "CABINET_OWNERSHIP_OR_RENTAL",
  },
  {
    descriptionKey:
      "doctorVerification.documents.items.goodStandingCertificate.description",
    fieldName: "goodStandingCertificateDocument",
    required: false,
    titleKey: "doctorVerification.documents.items.goodStandingCertificate.title",
    type: "GOOD_STANDING_CERTIFICATE",
  },
];

const defaultValues: DoctorVerificationFormInput = {
  fullName: "",
  birthDate: "",
  birthPlace: "",
  nationality: "",
  identityNumber: "",
  identityDocumentType: "",
  phone: "",
  professionalEmail: "",
  wilaya: "",
  commune: "",
  personalOrProfessionalAddress: "",
  doctorType: "",
  speciality: "",
  primaryDegree: "",
  university: "",
  graduationYear: "",
  specialityDegree: "",
  specialityGraduationYear: "",
  ordreRegistrationNumber: "",
  regionalCouncil: "",
  registrationWilaya: "",
  registrationDate: "",
  professionalStatus: "",
  practiceAuthorizationNumber: "",
  issuingAuthority: "",
  cabinetName: "",
  cabinetType: "",
  cabinetAddress: "",
  cabinetWilaya: "",
  cabinetCommune: "",
  cabinetPhone: "",
  cabinetEmail: "",
  healthDirectorate: "",
  cabinetOpeningAuthorizationNumber: "",
  nif: "",
  taxCenter: "",
  casnosNumber: "",
  fiscalActivityType: "",
  professionalRib: "",
  identityDocument: null,
  medicalDegreeDocument: null,
  specialityDegreeDocument: null,
  ordreRegistrationDocument: null,
  practiceAuthorizationDocument: null,
  cabinetAddressProofDocument: null,
  nifDocument: null,
  casnosCertificateDocument: null,
  cabinetOpeningAuthorizationDocument: null,
  professionalPhotoDocument: null,
  stampSignatureDocument: null,
  cabinetOwnershipOrRentalDocument: null,
  goodStandingCertificateDocument: null,
  confirmAuthenticity: false,
};

function createInitialDocumentStates() {
  return doctorDocuments.reduce<Record<DoctorDocumentType, DoctorDocumentUploadState>>(
    (states, document) => ({
      ...states,
      [document.type]: { status: "MISSING", type: document.type },
    }),
    {} as Record<DoctorDocumentType, DoctorDocumentUploadState>,
  );
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export function DoctorVerificationPage() {
  const { locale } = useStoredLocale();
  const { direction, t } = useTranslation(locale);
  const [status, setStatus] = useState<VerificationStatus>("NOT_STARTED");
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [completedStepIds, setCompletedStepIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isSubmitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [documentStates, setDocumentStates] = useState(createInitialDocumentStates);

  const schema = useMemo(
    () =>
      createDoctorVerificationSchema({
        confirmAuthenticity: t("doctorVerification.errors.confirmAuthenticity"),
        emailInvalid: t("doctorVerification.errors.emailInvalid"),
        fileTooLarge: t("doctorVerification.errors.fileTooLarge"),
        formatNotAccepted: t("doctorVerification.errors.formatNotAccepted"),
        required: t("doctorVerification.errors.required"),
      }),
    [t],
  );

  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    setError,
    clearErrors,
    setValue,
    trigger,
  } = useForm<DoctorVerificationFormInput>({
    defaultValues,
    mode: "onBlur",
    resolver: zodResolver(schema),
  });

  const watchedValues = useWatch({ control });
  const activeStep = doctorVerificationSteps[activeStepIndex];
  const isLastStep = activeStepIndex === doctorVerificationSteps.length - 1;
  const progressValue = Math.round(
    ((activeStepIndex + 1) / doctorVerificationSteps.length) * 100,
  );

  const requiredDocuments = useMemo(
    () =>
      doctorDocuments.filter(
        (document) =>
          document.required ||
          (document.type === "SPECIALITY_DEGREE" &&
            watchedValues.doctorType === "SPECIALIST"),
      ),
    [watchedValues.doctorType],
  );

  const displayedDocuments = useMemo(
    () =>
      doctorDocuments.map((document) =>
        document.type === "SPECIALITY_DEGREE" &&
        watchedValues.doctorType === "SPECIALIST"
          ? { ...document, required: true }
          : document,
      ),
    [watchedValues.doctorType],
  );

  const missingRequiredDocuments = useMemo(
    () =>
      requiredDocuments.filter((document) => {
        const state = documentStates[document.type];
        return state.status !== "READY" && state.status !== "UPLOADED";
      }),
    [documentStates, requiredDocuments],
  );

  const sectionCompletion = {
    identity: [
      watchedValues.fullName,
      watchedValues.birthDate,
      watchedValues.identityNumber,
      watchedValues.identityDocumentType,
      watchedValues.phone,
      watchedValues.professionalEmail,
      watchedValues.wilaya,
      watchedValues.commune,
    ].every(hasText),
    qualification: [
      watchedValues.doctorType,
      watchedValues.speciality,
      watchedValues.primaryDegree,
      watchedValues.university,
      watchedValues.graduationYear,
    ].every(hasText),
    professionalRegistration: [
      watchedValues.ordreRegistrationNumber,
      watchedValues.registrationWilaya,
      watchedValues.registrationDate,
      watchedValues.professionalStatus,
    ].every(hasText),
    practiceLocation: [
      watchedValues.cabinetType,
      watchedValues.cabinetAddress,
      watchedValues.cabinetWilaya,
      watchedValues.cabinetCommune,
      watchedValues.healthDirectorate,
    ].every(hasText),
    fiscalSocial: [
      watchedValues.nif,
      watchedValues.taxCenter,
      watchedValues.fiscalActivityType,
    ].every(hasText),
  };

  async function validateCurrentStep() {
    const isValid = await trigger(activeStep.fields);

    if (isValid) {
      setCompletedStepIds((current) => new Set(current).add(activeStep.id));
    }

    return isValid;
  }

  async function handleNext() {
    if (await validateCurrentStep()) {
      setActiveStepIndex((current) =>
        Math.min(current + 1, doctorVerificationSteps.length - 1),
      );
    }
  }

  function handlePrevious() {
    setActiveStepIndex((current) => Math.max(current - 1, 0));
  }

  async function handleStepClick(index: number) {
    if (index <= activeStepIndex) {
      setActiveStepIndex(index);
      return;
    }

    if (index === activeStepIndex + 1 && (await validateCurrentStep())) {
      setActiveStepIndex(index);
    }
  }

  function handleDocumentSelect(
    fieldName: DoctorDocumentDefinition["fieldName"],
    type: DoctorDocumentDefinition["type"],
    file: File | null,
  ) {
    if (!file) {
      setValue(fieldName, null, { shouldValidate: true });
      setDocumentStates((current) => ({
        ...current,
        [type]: { status: "MISSING", type },
      }));
      return;
    }

    if (!isAcceptedDoctorDocumentFile(file)) {
      setError(fieldName, {
        message: t("doctorVerification.errors.formatNotAccepted"),
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

    if (!isDoctorDocumentSizeValid(file)) {
      setError(fieldName, {
        message: t("doctorVerification.errors.fileTooLarge"),
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
  }

  const onSubmit = handleSubmit(async () => {
    const isValid = await trigger(activeStep.fields);

    if (!isValid || missingRequiredDocuments.length > 0) {
      return;
    }

    setSubmitting(true);

    try {
      // Backend validation, secure file storage and malware scanning remain mandatory.
      await new Promise((resolve) => window.setTimeout(resolve, 800));
      setCompletedStepIds(new Set(doctorVerificationSteps.map((step) => step.id)));
      setStatus("PENDING_VERIFICATION");
      setToastMessage(t("doctorVerification.submission.success"));
      setDocumentStates((current) =>
        Object.fromEntries(
          Object.entries(current).map(([key, value]) => [
            key,
            { ...value, status: value.fileName ? "UPLOADED" : value.status },
          ]),
        ) as Record<DoctorDocumentType, DoctorDocumentUploadState>,
      );
      window.setTimeout(() => setToastMessage(null), 3000);
    } finally {
      setSubmitting(false);
    }
  });

  const stepContent = [
    <DoctorIdentityStep
      key="identity"
      direction={direction}
      errors={errors}
      register={register}
      t={t}
    />,
    <DoctorQualificationStep
      key="qualification"
      direction={direction}
      errors={errors}
      register={register}
      t={t}
    />,
    <DoctorProfessionalRegistrationStep
      key="professional-registration"
      direction={direction}
      errors={errors}
      register={register}
      t={t}
    />,
    <DoctorPracticeLocationStep
      key="practice-location"
      direction={direction}
      errors={errors}
      register={register}
      t={t}
    />,
    <DoctorFiscalSocialStep
      key="fiscal-social"
      direction={direction}
      errors={errors}
      register={register}
      t={t}
    />,
    <DoctorSubmissionStep
      key="documents-submission"
      documentStates={documentStates}
      documents={displayedDocuments}
      errors={errors}
      missingRequiredDocuments={missingRequiredDocuments}
      onFileSelect={handleDocumentSelect}
      register={register}
      sectionCompletion={sectionCompletion}
      t={t}
    />,
  ];

  return (
    <DashboardShell
      accountType="INDEPENDENT_DOCTOR"
      activeKey="verification"
      breadcrumbLabel={t("doctorVerification.page.breadcrumb")}
      navSections={doctorNavSections}
      titleKey="doctorVerification.page.title"
      user={{
        accountType: "INDEPENDENT_DOCTOR",
        footerSubtitle: t("doctorVerification.profile.footerSubtitle"),
        initials: "AB",
        name: t("doctorVerification.profile.name"),
        roleKey: "dashboard.common.roles.doctor",
        workspaceSubtitle: t("doctorVerification.profile.workspaceSubtitle"),
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
        <p className="text-sm leading-6 text-slate-500">
          {t("doctorVerification.page.subtitle")}
        </p>

        <DoctorVerificationStatusCard
          demoBadgeLabel={t("doctorVerification.status.demoBadge")}
          description={
            status === "PENDING_VERIFICATION"
              ? t("doctorVerification.status.pendingDescription")
              : t("doctorVerification.status.notStarted")
          }
          isPending={status === "PENDING_VERIFICATION"}
          onStart={() => {
            const target = document.getElementById("doctor-verification-form");
            target?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          startLabel={t("doctorVerification.status.start")}
          status={status}
          statusLabel={t(`doctorVerification.status.values.${status}`)}
          statusTitle={t("doctorVerification.status.current")}
          title={
            status === "PENDING_VERIFICATION"
              ? t("doctorVerification.status.pendingTitle")
              : t("doctorVerification.page.title")
          }
        />

        <DoctorVerificationStepper
          activeStepIndex={activeStepIndex}
          completedStepIds={completedStepIds}
          direction={direction}
          onStepClick={handleStepClick}
          progressLabel={t("doctorVerification.steps.progress")}
          progressValue={progressValue}
          steps={doctorVerificationSteps}
          t={t}
        />

        <div className="rounded-[24px] border border-cyan-100 bg-cyan-50/50 p-5 text-sm leading-6 text-slate-600 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-cyan-700 shadow-sm">
              <Info className="h-4 w-4" />
            </span>
            <p>{t("doctorVerification.page.contextNotice")}</p>
          </div>
        </div>

        <form
          id="doctor-verification-form"
          className="space-y-6"
          onSubmit={(event) => event.preventDefault()}
        >
          {stepContent[activeStepIndex]}

          <DoctorVerificationSecurityNotice
            text={t("doctorVerification.security.text")}
            title={t("doctorVerification.security.title")}
          />

          {status === "PENDING_VERIFICATION" ? (
            <section className="rounded-[24px] border border-cyan-100 bg-cyan-50/50 p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-cyan-700 shadow-sm">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">
                    {t("doctorVerification.status.pendingTitle")}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {t("doctorVerification.status.pendingDescription")}
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          <DoctorVerificationNavigation
            direction={direction}
            isFirstStep={activeStepIndex === 0}
            isLastStep={isLastStep}
            isSubmitting={isSubmitting}
            nextLabel={t("doctorVerification.navigation.next")}
            onNext={handleNext}
            onPrevious={handlePrevious}
            onSubmit={onSubmit}
            previousLabel={t("doctorVerification.navigation.previous")}
            submitDisabled={missingRequiredDocuments.length > 0}
            submitLabel={t("doctorVerification.submission.submit")}
            submittingLabel={t("doctorVerification.submission.loading")}
          />
        </form>
      </section>
    </DashboardShell>
  );
}
