import { type FieldErrors, type UseFormRegister } from "react-hook-form";

import { FormErrorMessage } from "@/components/auth/register/FormErrorMessage";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ALGERIAN_WILAYAS, ESTABLISHMENT_TYPE_OPTIONS } from "@/types/auth";
import { type EstablishmentVerificationFormInput } from "@/features/verification/types/verification.types";

type EstablishmentInfoFormProps = {
  direction: "ltr" | "rtl";
  errors: FieldErrors<EstablishmentVerificationFormInput>;
  register: UseFormRegister<EstablishmentVerificationFormInput>;
  t: (key: string) => string;
};

export function EstablishmentInfoForm({
  direction,
  errors,
  register,
  t,
}: EstablishmentInfoFormProps) {
  return (
    <section className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-950">
          {t("verification.stepper.establishmentInfo")}
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label htmlFor="verification-establishmentName">
            {t("verification.form.establishmentName")}
          </Label>
          <Input
            id="verification-establishmentName"
            dir={direction}
            className="mt-2 text-start"
            placeholder={t("verification.form.placeholders.establishmentName")}
            aria-invalid={Boolean(errors.establishmentName)}
            {...register("establishmentName")}
          />
          <FormErrorMessage
            id="verification-establishmentName-error"
            message={errors.establishmentName?.message}
          />
        </div>

        <div>
          <Label htmlFor="verification-establishmentType">
            {t("verification.form.establishmentType")}
          </Label>
          <Select
            id="verification-establishmentType"
            dir={direction}
            className="mt-2 text-start"
            aria-invalid={Boolean(errors.establishmentType)}
            {...register("establishmentType")}
          >
            {ESTABLISHMENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value}
              </option>
            ))}
          </Select>
          <FormErrorMessage
            id="verification-establishmentType-error"
            message={errors.establishmentType?.message}
          />
        </div>

        <div>
          <Label htmlFor="verification-wilaya">{t("verification.form.wilaya")}</Label>
          <Select
            id="verification-wilaya"
            dir={direction}
            className="mt-2 text-start"
            aria-invalid={Boolean(errors.wilaya)}
            {...register("wilaya")}
          >
            {ALGERIAN_WILAYAS.map((wilaya) => (
              <option key={wilaya} value={wilaya}>
                {wilaya}
              </option>
            ))}
          </Select>
          <FormErrorMessage
            id="verification-wilaya-error"
            message={errors.wilaya?.message}
          />
        </div>

        <div className="md:col-span-2">
          <Label htmlFor="verification-address">{t("verification.form.address")}</Label>
          <Textarea
            id="verification-address"
            dir={direction}
            className="mt-2 text-start"
            placeholder={t("verification.form.placeholders.address")}
            aria-invalid={Boolean(errors.address)}
            {...register("address")}
          />
          <FormErrorMessage
            id="verification-address-error"
            message={errors.address?.message}
          />
        </div>

        <div>
          <Label htmlFor="verification-professionalEmail">
            {t("verification.form.professionalEmail")}
          </Label>
          <Input
            id="verification-professionalEmail"
            type="email"
            dir={direction}
            className="mt-2 text-start"
            placeholder={t("verification.form.placeholders.professionalEmail")}
            aria-invalid={Boolean(errors.professionalEmail)}
            {...register("professionalEmail")}
          />
          <FormErrorMessage
            id="verification-professionalEmail-error"
            message={errors.professionalEmail?.message}
          />
        </div>

        <div>
          <Label htmlFor="verification-phone">{t("verification.form.phone")}</Label>
          <Input
            id="verification-phone"
            type="tel"
            dir={direction}
            className="mt-2 text-start"
            placeholder={t("verification.form.placeholders.phone")}
            aria-invalid={Boolean(errors.phone)}
            {...register("phone")}
          />
          <FormErrorMessage
            id="verification-phone-error"
            message={errors.phone?.message}
          />
        </div>

        <div>
          <Label htmlFor="verification-managerFullName">
            {t("verification.form.managerFullName")}
          </Label>
          <Input
            id="verification-managerFullName"
            dir={direction}
            className="mt-2 text-start"
            placeholder={t("verification.form.placeholders.managerFullName")}
            aria-invalid={Boolean(errors.managerFullName)}
            {...register("managerFullName")}
          />
          <FormErrorMessage
            id="verification-managerFullName-error"
            message={errors.managerFullName?.message}
          />
        </div>

        <div>
          <Label htmlFor="verification-nif">{t("verification.form.nif")}</Label>
          <Input
            id="verification-nif"
            dir={direction}
            className="mt-2 text-start"
            placeholder={t("verification.form.placeholders.nif")}
            aria-invalid={Boolean(errors.nif)}
            {...register("nif")}
          />
          <FormErrorMessage id="verification-nif-error" message={errors.nif?.message} />
        </div>

        <div>
          <Label htmlFor="verification-commercialRegisterNumber">
            {t("verification.form.commercialRegisterNumber")}
          </Label>
          <Input
            id="verification-commercialRegisterNumber"
            dir={direction}
            className="mt-2 text-start"
            placeholder={t("verification.form.placeholders.commercialRegisterNumber")}
            aria-invalid={Boolean(errors.commercialRegisterNumber)}
            {...register("commercialRegisterNumber")}
          />
          <FormErrorMessage
            id="verification-commercialRegisterNumber-error"
            message={errors.commercialRegisterNumber?.message}
          />
        </div>

        <div>
          <Label htmlFor="verification-healthAuthorizationNumber">
            {t("verification.form.healthAuthorizationNumber")}
          </Label>
          <Input
            id="verification-healthAuthorizationNumber"
            dir={direction}
            className="mt-2 text-start"
            placeholder={t("verification.form.placeholders.healthAuthorizationNumber")}
            aria-invalid={Boolean(errors.healthAuthorizationNumber)}
            {...register("healthAuthorizationNumber")}
          />
          <FormErrorMessage
            id="verification-healthAuthorizationNumber-error"
            message={errors.healthAuthorizationNumber?.message}
          />
        </div>
      </div>
    </section>
  );
}
