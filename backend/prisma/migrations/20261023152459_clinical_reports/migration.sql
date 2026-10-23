-- CreateTable
CREATE TABLE `clinical_reports` (
    `id` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NULL,
    `workspace_id` VARCHAR(191) NOT NULL,
    `patient_id` VARCHAR(191) NOT NULL,
    `encounter_id` VARCHAR(191) NULL,
    `category` ENUM('AI_BRAIN', 'AI_ECG', 'AI_PATHOLOGY', 'AI_CARDIAC_MRI', 'CONSULTATION_NOTE', 'RADIOLOGY', 'LABORATORY_RESULT', 'EXTERNAL_MEDICAL', 'OTHER_CLINICAL') NOT NULL,
    `source_type` ENUM('AI_ANALYSIS', 'CONSULTATION', 'IMAGING', 'LABORATORY', 'EXTERNAL_DOCUMENT', 'OTHER') NOT NULL,
    `status` ENUM('DRAFT', 'FINAL', 'AMENDED', 'CANCELED') NOT NULL DEFAULT 'DRAFT',
    `title` VARCHAR(200) NOT NULL,
    `conclusion` TEXT NULL,
    `sections` JSON NOT NULL,
    `effective_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `version` INTEGER NOT NULL DEFAULT 1,
    `replaces_id` VARCHAR(191) NULL,
    `superseded_at` DATETIME(3) NULL,
    `author_id` VARCHAR(191) NOT NULL,
    `finalized_at` DATETIME(3) NULL,
    `finalized_by_id` VARCHAR(191) NULL,
    `canceled_at` DATETIME(3) NULL,
    `canceled_by_id` VARCHAR(191) NULL,
    `cancellation_reason` TEXT NULL,
    `patient_snapshot` JSON NULL,
    `author_snapshot` JSON NULL,
    `organization_snapshot` JSON NULL,
    `content_fingerprint` CHAR(64) NULL,
    `external_source` JSON NULL,
    `ai_analysis_report_id` VARCHAR(191) NULL,
    `patient_document_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `clinical_reports_number_key`(`number`),
    UNIQUE INDEX `clinical_reports_replaces_id_key`(`replaces_id`),
    UNIQUE INDEX `clinical_reports_ai_analysis_report_id_key`(`ai_analysis_report_id`),
    UNIQUE INDEX `clinical_reports_patient_document_id_key`(`patient_document_id`),
    INDEX `clinical_reports_workspace_id_superseded_at_idx`(`workspace_id`, `superseded_at`),
    INDEX `clinical_reports_patient_id_idx`(`patient_id`),
    INDEX `clinical_reports_status_idx`(`status`),
    INDEX `clinical_reports_category_idx`(`category`),
    INDEX `clinical_reports_effective_at_idx`(`effective_at`),
    INDEX `clinical_reports_author_id_idx`(`author_id`),
    INDEX `clinical_reports_encounter_id_idx`(`encounter_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `clinical_report_documents` (
    `id` VARCHAR(191) NOT NULL,
    `report_id` VARCHAR(191) NOT NULL,
    `stored_name` VARCHAR(255) NOT NULL,
    `local_path` VARCHAR(500) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    `size` INTEGER NOT NULL,
    `checksum` CHAR(64) NOT NULL,
    `content_fingerprint` CHAR(64) NOT NULL,
    `generated_by_id` VARCHAR(191) NOT NULL,
    `generated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `clinical_report_documents_report_id_key`(`report_id`),
    INDEX `clinical_report_documents_generated_by_id_idx`(`generated_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `clinical_reports` ADD CONSTRAINT `clinical_reports_workspace_id_fkey` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clinical_reports` ADD CONSTRAINT `clinical_reports_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clinical_reports` ADD CONSTRAINT `clinical_reports_encounter_id_fkey` FOREIGN KEY (`encounter_id`) REFERENCES `patient_consultations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clinical_reports` ADD CONSTRAINT `clinical_reports_replaces_id_fkey` FOREIGN KEY (`replaces_id`) REFERENCES `clinical_reports`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clinical_reports` ADD CONSTRAINT `clinical_reports_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clinical_reports` ADD CONSTRAINT `clinical_reports_finalized_by_id_fkey` FOREIGN KEY (`finalized_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clinical_reports` ADD CONSTRAINT `clinical_reports_canceled_by_id_fkey` FOREIGN KEY (`canceled_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clinical_reports` ADD CONSTRAINT `clinical_reports_ai_analysis_report_id_fkey` FOREIGN KEY (`ai_analysis_report_id`) REFERENCES `ai_analysis_reports`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clinical_reports` ADD CONSTRAINT `clinical_reports_patient_document_id_fkey` FOREIGN KEY (`patient_document_id`) REFERENCES `patient_documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clinical_report_documents` ADD CONSTRAINT `clinical_report_documents_report_id_fkey` FOREIGN KEY (`report_id`) REFERENCES `clinical_reports`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clinical_report_documents` ADD CONSTRAINT `clinical_report_documents_generated_by_id_fkey` FOREIGN KEY (`generated_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: the report of every existing AI analysis (ai_analysis_reports) gets
-- its clinical_reports row, FINAL, numbered like its PDF (CR-IA-<year>-<NNNNNN>).
-- Idempotent: ai_analysis_report_id is unique and NOT EXISTS skips what is
-- already there, so the statement can run again without effect. Patients with
-- no workspace (legacy rows) are left out: a report belongs to a workspace.
INSERT INTO `clinical_reports` (
    `id`, `number`, `workspace_id`, `patient_id`, `category`, `source_type`,
    `status`, `title`, `sections`, `effective_at`, `version`, `author_id`,
    `finalized_at`, `finalized_by_id`, `patient_snapshot`, `author_snapshot`,
    `content_fingerprint`, `ai_analysis_report_id`, `created_at`, `updated_at`
)
SELECT
    CONCAT('crai', REPLACE(UUID(), '-', '')),
    ar.`report_number`,
    p.`workspace_id`,
    r.`patient_id`,
    CASE r.`pipeline`
        WHEN 'brain' THEN 'AI_BRAIN'
        WHEN 'cardio-ecg' THEN 'AI_ECG'
        WHEN 'cardio-seg-mri' THEN 'AI_CARDIAC_MRI'
        ELSE 'AI_PATHOLOGY'
    END,
    'AI_ANALYSIS',
    'FINAL',
    CASE r.`pipeline`
        WHEN 'brain' THEN 'Compte rendu IA — Brain'
        WHEN 'cardio-ecg' THEN 'Compte rendu IA — ECG'
        WHEN 'cardio-seg-mri' THEN 'Compte rendu IA — IRM cardiaque'
        WHEN 'pathology-nuclei' THEN 'Compte rendu IA — segmentation nucléaire'
        ELSE 'Compte rendu IA — Pathology'
    END,
    JSON_ARRAY(),
    r.`created_at`,
    1,
    COALESCE(r.`decided_by_id`, ar.`generated_by_id`),
    COALESCE(r.`decided_at`, ar.`created_at`),
    COALESCE(r.`decided_by_id`, ar.`generated_by_id`),
    JSON_OBJECT(
        'firstName', p.`first_name`,
        'firstNameAr', p.`first_name_ar`,
        'lastName', p.`last_name`,
        'lastNameAr', p.`last_name_ar`,
        'birthDate', DATE_FORMAT(p.`birth_date`, '%Y-%m-%d'),
        'gender', p.`gender`,
        'hospitalRecordNumber', p.`hospital_record_number`
    ),
    JSON_OBJECT(
        'fullName', u.`full_name`,
        'speciality', dp.`speciality`,
        'registrationNumber', NULL,
        'regionalCouncil', NULL
    ),
    ar.`content_sha256`,
    ar.`id`,
    ar.`created_at`,
    ar.`created_at`
FROM `ai_analysis_reports` ar
JOIN `ai_analysis_runs` r ON r.`id` = ar.`run_id`
JOIN `patients` p ON p.`id` = r.`patient_id`
JOIN `users` u ON u.`id` = COALESCE(r.`decided_by_id`, ar.`generated_by_id`)
LEFT JOIN `doctor_profiles` dp ON dp.`user_id` = u.`id`
WHERE p.`workspace_id` IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM `clinical_reports` cr WHERE cr.`ai_analysis_report_id` = ar.`id`
  );
