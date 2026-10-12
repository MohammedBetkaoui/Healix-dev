-- AlterTable
ALTER TABLE `ai_analysis_runs` ADD COLUMN `decision_threshold` DOUBLE NULL,
    ADD COLUMN `magnification` INTEGER NULL,
    ADD COLUMN `malignancy_score` DOUBLE NULL,
    ADD COLUMN `model_decision` VARCHAR(20) NULL,
    ADD COLUMN `nuclei_fractions` JSON NULL,
    ADD COLUMN `overlay_path` VARCHAR(512) NULL,
    ADD COLUMN `tile_count` INTEGER NULL,
    ADD COLUMN `tta_scores` JSON NULL;
