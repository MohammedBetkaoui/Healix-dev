-- CreateTable
CREATE TABLE `medication_references` (
    `id` VARCHAR(191) NOT NULL,
    `dci` VARCHAR(160) NOT NULL,
    `brand_name` VARCHAR(160) NULL,
    `strength` VARCHAR(120) NOT NULL,
    `pharmaceutical_form` ENUM('TABLET', 'CAPSULE', 'ORAL_SOLUTION', 'INJECTABLE', 'EYE_DROPS', 'OINTMENT', 'INHALER', 'OTHER') NOT NULL,
    `route` ENUM('ORAL', 'IV', 'IM', 'SC', 'CUTANEOUS', 'OPHTHALMIC', 'INHALED', 'OTHER') NOT NULL,
    `manufacturer` VARCHAR(160) NULL,
    `regulatory_category` ENUM('STANDARD', 'REGULATED', 'PSYCHOTROPIC', 'NARCOTIC') NOT NULL,
    `reimbursable` ENUM('YES', 'NO', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `requires_prior_approval` ENUM('YES', 'NO', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `source` VARCHAR(40) NOT NULL,
    `source_reference` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `medication_references_dci_idx`(`dci`),
    INDEX `medication_references_brand_name_idx`(`brand_name`),
    INDEX `medication_references_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `clinical_document_sequences` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `year` INTEGER NOT NULL,
    `last_value` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `clinical_document_sequences_type_year_key`(`type`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prescriptions` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NULL,
    `workspace_id` VARCHAR(191) NOT NULL,
    `patient_id` VARCHAR(191) NOT NULL,
    `prescriber_doctor_profile_id` VARCHAR(191) NOT NULL,
    `encounter_id` VARCHAR(191) NULL,
    `created_by_id` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'PENDING_VALIDATION', 'VALIDATED', 'CANCELED') NOT NULL DEFAULT 'DRAFT',
    `type` ENUM('STANDARD', 'REGULATED', 'PSYCHOTROPIC', 'NARCOTIC') NOT NULL DEFAULT 'STANDARD',
    `prescribed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `valid_until` DATETIME(3) NULL,
    `based_on_prescription_id` VARCHAR(191) NULL,
    `validated_at` DATETIME(3) NULL,
    `validated_by_id` VARCHAR(191) NULL,
    `canceled_at` DATETIME(3) NULL,
    `canceled_by_id` VARCHAR(191) NULL,
    `cancellation_reason` TEXT NULL,
    `printed_at` DATETIME(3) NULL,
    `print_count` INTEGER NOT NULL DEFAULT 0,
    `regulatory_data` JSON NULL,
    `patient_snapshot` JSON NULL,
    `prescriber_snapshot` JSON NULL,
    `organization_snapshot` JSON NULL,
    `insurance_snapshot` JSON NULL,
    `clinical_context_snapshot` JSON NULL,
    `safety_snapshot` JSON NULL,
    `regulatory_snapshot` JSON NULL,
    `content_fingerprint` CHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `prescriptions_number_key`(`number`),
    INDEX `prescriptions_workspace_id_idx`(`workspace_id`),
    INDEX `prescriptions_patient_id_idx`(`patient_id`),
    INDEX `prescriptions_prescriber_doctor_profile_id_idx`(`prescriber_doctor_profile_id`),
    INDEX `prescriptions_encounter_id_idx`(`encounter_id`),
    INDEX `prescriptions_status_idx`(`status`),
    INDEX `prescriptions_type_idx`(`type`),
    INDEX `prescriptions_prescribed_at_idx`(`prescribed_at`),
    INDEX `prescriptions_based_on_prescription_id_idx`(`based_on_prescription_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prescription_items` (
    `id` VARCHAR(191) NOT NULL,
    `prescription_id` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `medication_id` VARCHAR(191) NULL,
    `dci` VARCHAR(160) NOT NULL,
    `brand_name` VARCHAR(160) NULL,
    `strength` VARCHAR(120) NOT NULL,
    `pharmaceutical_form` ENUM('TABLET', 'CAPSULE', 'ORAL_SOLUTION', 'INJECTABLE', 'EYE_DROPS', 'OINTMENT', 'INHALER', 'OTHER') NOT NULL,
    `route` ENUM('ORAL', 'IV', 'IM', 'SC', 'CUTANEOUS', 'OPHTHALMIC', 'INHALED', 'OTHER') NOT NULL,
    `manufacturer` VARCHAR(160) NULL,
    `regulatory_category` ENUM('STANDARD', 'REGULATED', 'PSYCHOTROPIC', 'NARCOTIC') NOT NULL,
    `dose_per_intake` VARCHAR(255) NOT NULL,
    `frequency` VARCHAR(255) NOT NULL,
    `intake_moment` VARCHAR(255) NULL,
    `duration_days` INTEGER NULL,
    `quantity` VARCHAR(255) NOT NULL,
    `patient_instructions` TEXT NULL,
    `indication` TEXT NULL,
    `as_needed` BOOLEAN NOT NULL DEFAULT false,
    `renewal_allowed` BOOLEAN NOT NULL DEFAULT false,
    `substitution_allowed` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `prescription_items_prescription_id_position_key`(`prescription_id`, `position`),
    INDEX `prescription_items_prescription_id_idx`(`prescription_id`),
    INDEX `prescription_items_medication_id_idx`(`medication_id`),
    INDEX `prescription_items_dci_idx`(`dci`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prescription_documents` (
    `id` VARCHAR(191) NOT NULL,
    `prescription_id` VARCHAR(191) NOT NULL,
    `stored_name` VARCHAR(255) NOT NULL,
    `local_path` VARCHAR(500) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    `size` INTEGER NOT NULL,
    `checksum` CHAR(64) NOT NULL,
    `content_fingerprint` CHAR(64) NOT NULL,
    `generated_by_id` VARCHAR(191) NOT NULL,
    `generated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `prescription_documents_prescription_id_key`(`prescription_id`),
    INDEX `prescription_documents_generated_by_id_idx`(`generated_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `patient_documents` ADD COLUMN `prescription_id` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `patient_documents_prescription_id_key` ON `patient_documents`(`prescription_id`);

-- AddForeignKey
ALTER TABLE `prescriptions` ADD CONSTRAINT `prescriptions_workspace_id_fkey` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `prescriptions` ADD CONSTRAINT `prescriptions_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `prescriptions` ADD CONSTRAINT `prescriptions_prescriber_doctor_profile_id_fkey` FOREIGN KEY (`prescriber_doctor_profile_id`) REFERENCES `doctor_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `prescriptions` ADD CONSTRAINT `prescriptions_encounter_id_fkey` FOREIGN KEY (`encounter_id`) REFERENCES `patient_consultations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `prescriptions` ADD CONSTRAINT `prescriptions_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `prescriptions` ADD CONSTRAINT `prescriptions_validated_by_id_fkey` FOREIGN KEY (`validated_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `prescriptions` ADD CONSTRAINT `prescriptions_canceled_by_id_fkey` FOREIGN KEY (`canceled_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `prescriptions` ADD CONSTRAINT `prescriptions_based_on_prescription_id_fkey` FOREIGN KEY (`based_on_prescription_id`) REFERENCES `prescriptions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `prescription_items` ADD CONSTRAINT `prescription_items_prescription_id_fkey` FOREIGN KEY (`prescription_id`) REFERENCES `prescriptions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `prescription_items` ADD CONSTRAINT `prescription_items_medication_id_fkey` FOREIGN KEY (`medication_id`) REFERENCES `medication_references`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `prescription_documents` ADD CONSTRAINT `prescription_documents_prescription_id_fkey` FOREIGN KEY (`prescription_id`) REFERENCES `prescriptions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `prescription_documents` ADD CONSTRAINT `prescription_documents_generated_by_id_fkey` FOREIGN KEY (`generated_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `patient_documents` ADD CONSTRAINT `patient_documents_prescription_id_fkey` FOREIGN KEY (`prescription_id`) REFERENCES `prescriptions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
