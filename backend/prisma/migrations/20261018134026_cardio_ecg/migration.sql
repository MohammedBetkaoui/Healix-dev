-- AlterTable
ALTER TABLE `ai_analysis_runs` ADD COLUMN `decision_labels` JSON NULL,
    ADD COLUMN `trace_path` VARCHAR(512) NULL;

-- AlterTable
ALTER TABLE `patient_documents` MODIFY `document_type` ENUM('PRESCRIPTION', 'MEDICAL_REPORT', 'MEDICAL_IMAGE', 'DICOM', 'ECG_SIGNAL') NOT NULL;
