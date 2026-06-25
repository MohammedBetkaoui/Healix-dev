-- CreateTable
CREATE TABLE `doctor_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `speciality` VARCHAR(100) NOT NULL,
    `wilaya` VARCHAR(80) NOT NULL,
    `professional_address` VARCHAR(255) NOT NULL,
    `is_independent` BOOLEAN NOT NULL DEFAULT true,
    `establishment_id` VARCHAR(191) NULL,
    `verification_status` ENUM('NOT_STARTED', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'SUSPENDED') NOT NULL,
    `subscription_status` ENUM('NO_PLAN', 'PAYMENT_PENDING', 'ACTIVE', 'EXPIRED', 'CANCELED') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `doctor_profiles_user_id_key`(`user_id`),
    INDEX `doctor_profiles_establishment_id_idx`(`establishment_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `doctor_profiles` ADD CONSTRAINT `doctor_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `doctor_profiles` ADD CONSTRAINT `doctor_profiles_establishment_id_fkey` FOREIGN KEY (`establishment_id`) REFERENCES `establishments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
