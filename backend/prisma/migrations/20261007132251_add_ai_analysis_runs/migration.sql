-- CreateTable
CREATE TABLE `ai_analysis_runs` (
    `id` VARCHAR(191) NOT NULL,
    `patient_id` VARCHAR(191) NOT NULL,
    `source_document_id` VARCHAR(191) NOT NULL,
    `pipeline` VARCHAR(40) NOT NULL,
    `status` ENUM('RUNNING', 'SUCCEEDED', 'FAILED', 'REJECTED_INPUT') NOT NULL,
    `classification_model_id` VARCHAR(120) NULL,
    `classification_weights_sha256` CHAR(64) NULL,
    `predictions` JSON NULL,
    `segmentation_model_id` VARCHAR(120) NULL,
    `segmentation_weights_sha256` CHAR(64) NULL,
    `mask_path` VARCHAR(512) NULL,
    `mask_area_px` INTEGER NULL,
    `mask_area_ratio` DOUBLE NULL,
    `segmentation_skipped_reason` VARCHAR(60) NULL,
    `clinician_impression` TEXT NULL,
    `error_code` VARCHAR(60) NULL,
    `duration_ms` INTEGER NULL,
    `requested_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ai_analysis_runs_patient_id_idx`(`patient_id`),
    INDEX `ai_analysis_runs_source_document_id_idx`(`source_document_id`),
    INDEX `ai_analysis_runs_requested_by_id_idx`(`requested_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ai_analysis_runs` ADD CONSTRAINT `ai_analysis_runs_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_analysis_runs` ADD CONSTRAINT `ai_analysis_runs_source_document_id_fkey` FOREIGN KEY (`source_document_id`) REFERENCES `patient_documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_analysis_runs` ADD CONSTRAINT `ai_analysis_runs_requested_by_id_fkey` FOREIGN KEY (`requested_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
