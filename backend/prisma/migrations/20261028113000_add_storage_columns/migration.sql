-- The private, encrypted storage (src/storage/): every document table gains
-- the reference of the file in the StorageService and the version of the
-- format it was written with. A row is migrated by the script
-- (scripts/migrate-legacy-storage.ts): it fills storage_key and then removes
-- local_path; in between, a null local_path means "not moved yet, the file
-- lives under UPLOAD_ROOT" for the rows created before this migration.
ALTER TABLE `ai_analysis_reports` ADD COLUMN `storage_key` VARCHAR(255) NULL,
    ADD COLUMN `encryption_version` INTEGER NULL,
    MODIFY `file_path` VARCHAR(512) NULL;

ALTER TABLE `clinical_report_documents` ADD COLUMN `storage_key` VARCHAR(255) NULL,
    ADD COLUMN `encryption_version` INTEGER NULL,
    MODIFY `local_path` VARCHAR(500) NULL;

ALTER TABLE `patient_documents` ADD COLUMN `storage_key` VARCHAR(255) NULL,
    ADD COLUMN `encryption_version` INTEGER NULL,
    MODIFY `local_path` VARCHAR(500) NULL;

ALTER TABLE `payment_proof_documents` ADD COLUMN `storage_key` VARCHAR(255) NULL,
    ADD COLUMN `encryption_version` INTEGER NULL,
    MODIFY `local_path` VARCHAR(500) NULL;

ALTER TABLE `prescription_documents` ADD COLUMN `storage_key` VARCHAR(255) NULL,
    ADD COLUMN `encryption_version` INTEGER NULL,
    MODIFY `local_path` VARCHAR(500) NULL;

ALTER TABLE `verification_documents` ADD COLUMN `storage_key` VARCHAR(255) NULL,
    ADD COLUMN `encryption_version` INTEGER NULL,
    MODIFY `local_path` VARCHAR(500) NULL;

-- The keys are unique (one key, one file): a uniqueness that the application
-- enforces first and the schema guarantees.
CREATE UNIQUE INDEX `ai_analysis_reports_storage_key_key` ON `ai_analysis_reports`(`storage_key`);
CREATE UNIQUE INDEX `clinical_report_documents_storage_key_key` ON `clinical_report_documents`(`storage_key`);
CREATE UNIQUE INDEX `patient_documents_storage_key_key` ON `patient_documents`(`storage_key`);
CREATE UNIQUE INDEX `payment_proof_documents_storage_key_key` ON `payment_proof_documents`(`storage_key`);
CREATE UNIQUE INDEX `prescription_documents_storage_key_key` ON `prescription_documents`(`storage_key`);
CREATE UNIQUE INDEX `verification_documents_storage_key_key` ON `verification_documents`(`storage_key`);
