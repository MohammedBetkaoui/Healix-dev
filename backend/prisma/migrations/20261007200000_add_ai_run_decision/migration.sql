-- AlterTable
ALTER TABLE `ai_analysis_runs` ADD COLUMN `decided_at` DATETIME(3) NULL,
    ADD COLUMN `decided_by_id` VARCHAR(191) NULL,
    ADD COLUMN `decision_label` VARCHAR(40) NULL,
    ADD COLUMN `decision_reason` TEXT NULL,
    ADD COLUMN `decision_status` ENUM('VALIDATED', 'CORRECTED', 'REJECTED') NULL;

-- CreateIndex
CREATE INDEX `ai_analysis_runs_decided_by_id_idx` ON `ai_analysis_runs`(`decided_by_id`);

-- AddForeignKey
ALTER TABLE `ai_analysis_runs` ADD CONSTRAINT `ai_analysis_runs_decided_by_id_fkey` FOREIGN KEY (`decided_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

