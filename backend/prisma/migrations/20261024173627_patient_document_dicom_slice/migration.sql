-- AlterTable
ALTER TABLE `patient_documents` ADD COLUMN `dicom_study_id` VARCHAR(191) NULL,
    ADD COLUMN `instance_number` INTEGER NULL,
    ADD COLUMN `series_instance_uid` VARCHAR(64) NULL,
    ADD COLUMN `series_number` INTEGER NULL,
    ADD COLUMN `sop_instance_uid` VARCHAR(64) NULL;

-- CreateIndex
CREATE INDEX `patient_documents_patient_id_sop_instance_uid_idx` ON `patient_documents`(`patient_id`, `sop_instance_uid`);

-- CreateIndex
CREATE INDEX `patient_documents_dicom_study_id_idx` ON `patient_documents`(`dicom_study_id`);

-- AddForeignKey
ALTER TABLE `patient_documents` ADD CONSTRAINT `patient_documents_dicom_study_id_fkey` FOREIGN KEY (`dicom_study_id`) REFERENCES `dicom_studies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
