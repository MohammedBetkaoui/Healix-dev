-- CreateTable
CREATE TABLE `notifications` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `workspace_id` VARCHAR(191) NULL,
    `category` ENUM('APPOINTMENT', 'PATIENT', 'AI_ANALYSIS', 'REPORT', 'PRESCRIPTION', 'MESSAGING', 'VERIFICATION', 'SUBSCRIPTION', 'PAYMENT', 'TEAM', 'SECURITY', 'SYSTEM') NOT NULL,
    `type` VARCHAR(100) NOT NULL,
    `severity` ENUM('INFO', 'SUCCESS', 'WARNING', 'CRITICAL') NOT NULL DEFAULT 'INFO',
    `resource_type` ENUM('APPOINTMENT', 'PATIENT', 'AI_ANALYSIS_RUN', 'AI_REPORT', 'PRESCRIPTION', 'CONVERSATION', 'VERIFICATION_REQUEST', 'PAYMENT', 'SUBSCRIPTION', 'DOCTOR_PROFILE', 'USER', 'SYSTEM') NULL,
    `resource_id` VARCHAR(191) NULL,
    `data` JSON NULL,
    `dedupe_key` VARCHAR(191) NULL,
    `read_at` DATETIME(3) NULL,
    `archived_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `notifications_user_id_dedupe_key_key`(`user_id`, `dedupe_key`),
    INDEX `notifications_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `notifications_user_id_read_at_idx`(`user_id`, `read_at`),
    INDEX `notifications_workspace_id_idx`(`workspace_id`),
    INDEX `notifications_category_idx`(`category`),
    INDEX `notifications_resource_type_resource_id_idx`(`resource_type`, `resource_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_preferences` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `category` ENUM('APPOINTMENT', 'PATIENT', 'AI_ANALYSIS', 'REPORT', 'PRESCRIPTION', 'MESSAGING', 'VERIFICATION', 'SUBSCRIPTION', 'PAYMENT', 'TEAM', 'SECURITY', 'SYSTEM') NOT NULL,
    `in_app_enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `notification_preferences_user_id_category_key`(`user_id`, `category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_workspace_id_fkey` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_preferences` ADD CONSTRAINT `notification_preferences_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
