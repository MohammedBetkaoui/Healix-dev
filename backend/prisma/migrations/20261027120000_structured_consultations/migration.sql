-- Evolve the existing consultation table in place. Legacy consultations were
-- already recorded as complete clinical notes, so they are backfilled as
-- COMPLETED instead of being reopened as editable drafts.

-- Drop legacy foreign keys whose delete semantics become restrictive.
ALTER TABLE `patient_consultations` DROP FOREIGN KEY `patient_consultations_patient_id_fkey`;
ALTER TABLE `patient_consultations` DROP FOREIGN KEY `patient_consultations_doctor_profile_id_fkey`;

-- Add the structured encounter columns as nullable while existing rows are
-- backfilled. workspace/doctor/author become mandatory below.
ALTER TABLE `patient_consultations`
    ADD COLUMN `workspace_id` VARCHAR(191) NULL,
    ADD COLUMN `status` ENUM('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELED') NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN `started_at` DATETIME(3) NULL,
    ADD COLUMN `completed_at` DATETIME(3) NULL,
    ADD COLUMN `canceled_at` DATETIME(3) NULL,
    ADD COLUMN `chief_complaint` TEXT NULL,
    ADD COLUMN `history_present_illness` TEXT NULL,
    ADD COLUMN `clinical_examination` TEXT NULL,
    ADD COLUMN `assessment` TEXT NULL,
    ADD COLUMN `care_plan` TEXT NULL,
    ADD COLUMN `follow_up_plan` TEXT NULL,
    ADD COLUMN `cancellation_reason` TEXT NULL,
    ADD COLUMN `created_by_id` VARCHAR(191) NULL,
    ADD COLUMN `completed_by_id` VARCHAR(191) NULL;

-- Preserve every legacy clinical field and its clinical date. The author is
-- derived from the responsible doctor, never guessed from another account.
UPDATE `patient_consultations` c
JOIN `patients` p ON p.`id` = c.`patient_id`
LEFT JOIN `appointments` a ON a.`id` = c.`appointment_id`
LEFT JOIN `doctor_profiles` dp ON dp.`id` = COALESCE(c.`doctor_profile_id`, a.`doctor_profile_id`, p.`doctor_profile_id`)
SET c.`workspace_id` = p.`workspace_id`,
    c.`doctor_profile_id` = COALESCE(c.`doctor_profile_id`, a.`doctor_profile_id`, p.`doctor_profile_id`),
    c.`status` = 'COMPLETED',
    c.`started_at` = c.`date`,
    c.`completed_at` = c.`date`,
    c.`chief_complaint` = NULLIF(c.`reason`, ''),
    c.`assessment` = NULLIF(c.`diagnosis`, ''),
    c.`care_plan` = NULLIF(c.`treatment`, ''),
    c.`created_by_id` = dp.`user_id`,
    c.`completed_by_id` = dp.`user_id`;

-- Mandatory tenant and clinical authorship. This deliberately stops the
-- migration if a legacy row cannot be assigned without inventing an owner.
ALTER TABLE `patient_consultations`
    MODIFY `workspace_id` VARCHAR(191) NOT NULL,
    MODIFY `doctor_profile_id` VARCHAR(191) NOT NULL,
    MODIFY `created_by_id` VARCHAR(191) NOT NULL,
    DROP COLUMN `date`,
    DROP COLUMN `reason`,
    DROP COLUMN `diagnosis`,
    DROP COLUMN `treatment`;

CREATE INDEX `patient_consultations_workspace_id_idx` ON `patient_consultations`(`workspace_id`);
CREATE INDEX `patient_consultations_doctor_profile_id_idx` ON `patient_consultations`(`doctor_profile_id`);
CREATE INDEX `patient_consultations_status_idx` ON `patient_consultations`(`status`);
CREATE INDEX `patient_consultations_started_at_idx` ON `patient_consultations`(`started_at`);

CREATE TABLE `consultation_vital_signs` (
    `id` VARCHAR(191) NOT NULL,
    `consultation_id` VARCHAR(191) NOT NULL,
    `systolic_bp` INTEGER NULL,
    `diastolic_bp` INTEGER NULL,
    `heart_rate` INTEGER NULL,
    `respiratory_rate` INTEGER NULL,
    `oxygen_saturation` DOUBLE NULL,
    `temperature` DOUBLE NULL,
    `weight_kg` DOUBLE NULL,
    `height_cm` DOUBLE NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `consultation_vital_signs_consultation_id_key`(`consultation_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `consultation_diagnoses` (
    `id` VARCHAR(191) NOT NULL,
    `consultation_id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(500) NOT NULL,
    `code` VARCHAR(80) NULL,
    `code_system` VARCHAR(80) NULL,
    `is_primary` BOOLEAN NOT NULL DEFAULT false,
    `note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `consultation_diagnoses_consultation_id_idx`(`consultation_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `consultation_addenda` (
    `id` VARCHAR(191) NOT NULL,
    `consultation_id` VARCHAR(191) NOT NULL,
    `author_id` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `consultation_addenda_consultation_id_idx`(`consultation_id`),
    INDEX `consultation_addenda_author_id_idx`(`author_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `patient_consultations` ADD CONSTRAINT `patient_consultations_workspace_id_fkey` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `patient_consultations` ADD CONSTRAINT `patient_consultations_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `patient_consultations` ADD CONSTRAINT `patient_consultations_doctor_profile_id_fkey` FOREIGN KEY (`doctor_profile_id`) REFERENCES `doctor_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `patient_consultations` ADD CONSTRAINT `patient_consultations_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `patient_consultations` ADD CONSTRAINT `patient_consultations_completed_by_id_fkey` FOREIGN KEY (`completed_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `consultation_vital_signs` ADD CONSTRAINT `consultation_vital_signs_consultation_id_fkey` FOREIGN KEY (`consultation_id`) REFERENCES `patient_consultations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `consultation_diagnoses` ADD CONSTRAINT `consultation_diagnoses_consultation_id_fkey` FOREIGN KEY (`consultation_id`) REFERENCES `patient_consultations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `consultation_addenda` ADD CONSTRAINT `consultation_addenda_consultation_id_fkey` FOREIGN KEY (`consultation_id`) REFERENCES `patient_consultations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `consultation_addenda` ADD CONSTRAINT `consultation_addenda_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
