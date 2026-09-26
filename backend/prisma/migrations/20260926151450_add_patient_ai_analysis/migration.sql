-- CreateTable
CREATE TABLE `patient_ai_analyses` (
    `id` VARCHAR(191) NOT NULL,
    `patient_id` VARCHAR(191) NOT NULL,
    `type` ENUM('MRI', 'CT_SCAN', 'XRAY', 'ECG') NOT NULL,
    `result` ENUM('NORMAL', 'ANOMALY_DETECTED') NOT NULL,
    `score` DOUBLE NOT NULL,
    `model_name` VARCHAR(120) NOT NULL,
    `model_version` VARCHAR(40) NULL,
    `source_document_id` VARCHAR(191) NULL,
    `requested_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `patient_ai_analyses_patient_id_idx`(`patient_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `patient_ai_analyses` ADD CONSTRAINT `patient_ai_analyses_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `patient_ai_analyses` ADD CONSTRAINT `patient_ai_analyses_source_document_id_fkey` FOREIGN KEY (`source_document_id`) REFERENCES `patient_documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `patient_ai_analyses` ADD CONSTRAINT `patient_ai_analyses_requested_by_id_fkey` FOREIGN KEY (`requested_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
