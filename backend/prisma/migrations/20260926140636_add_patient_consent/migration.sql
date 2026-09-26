-- CreateTable
CREATE TABLE `patient_consents` (
    `id` VARCHAR(191) NOT NULL,
    `patient_id` VARCHAR(191) NOT NULL,
    `type` ENUM('HEALTH_DATA', 'DIAGNOSTIC_AI', 'RESEARCH') NOT NULL,
    `status` ENUM('SIGNED', 'NOT_GRANTED') NOT NULL,
    `document_name` VARCHAR(255) NULL,
    `recorded_at` DATETIME(3) NOT NULL,
    `recorded_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `patient_consents_patient_id_idx`(`patient_id`),
    INDEX `patient_consents_recorded_by_id_idx`(`recorded_by_id`),
    UNIQUE INDEX `patient_consents_patient_id_type_key`(`patient_id`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `patient_consents` ADD CONSTRAINT `patient_consents_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `patient_consents` ADD CONSTRAINT `patient_consents_recorded_by_id_fkey` FOREIGN KEY (`recorded_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
