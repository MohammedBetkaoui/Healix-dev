-- CreateTable
CREATE TABLE `dicom_studies` (
    `id` VARCHAR(191) NOT NULL,
    `workspace_id` VARCHAR(191) NOT NULL,
    `patient_id` VARCHAR(191) NOT NULL,
    `orthanc_study_id` VARCHAR(64) NOT NULL,
    `study_instance_uid` VARCHAR(64) NOT NULL,
    `study_date` DATE NULL,
    `study_description` VARCHAR(255) NULL,
    `modalities` JSON NOT NULL,
    `series_count` INTEGER NOT NULL,
    `instances_count` INTEGER NOT NULL,
    `size_bytes` BIGINT NOT NULL,
    `identity_warnings` JSON NOT NULL,
    `uploaded_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dicom_studies_patient_id_idx`(`patient_id`),
    INDEX `dicom_studies_orthanc_study_id_idx`(`orthanc_study_id`),
    UNIQUE INDEX `dicom_studies_workspace_id_study_instance_uid_key`(`workspace_id`, `study_instance_uid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `dicom_studies` ADD CONSTRAINT `dicom_studies_workspace_id_fkey` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dicom_studies` ADD CONSTRAINT `dicom_studies_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dicom_studies` ADD CONSTRAINT `dicom_studies_uploaded_by_id_fkey` FOREIGN KEY (`uploaded_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
