-- AlterTable
ALTER TABLE `ai_analysis_runs` ADD COLUMN `volumetry` JSON NULL;

-- AlterTable
ALTER TABLE `patient_documents` ADD COLUMN `dicom_series` JSON NULL;
