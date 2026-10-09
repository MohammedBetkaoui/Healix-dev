-- CreateTable
CREATE TABLE `ai_analysis_reports` (
    `id` VARCHAR(191) NOT NULL,
    `run_id` VARCHAR(191) NOT NULL,
    `report_number` VARCHAR(20) NOT NULL,
    `file_path` VARCHAR(512) NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `content_sha256` CHAR(64) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `generated_by_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ai_analysis_reports_run_id_key`(`run_id`),
    UNIQUE INDEX `ai_analysis_reports_report_number_key`(`report_number`),
    INDEX `ai_analysis_reports_generated_by_id_idx`(`generated_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ai_analysis_reports` ADD CONSTRAINT `ai_analysis_reports_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `ai_analysis_runs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_analysis_reports` ADD CONSTRAINT `ai_analysis_reports_generated_by_id_fkey` FOREIGN KEY (`generated_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

