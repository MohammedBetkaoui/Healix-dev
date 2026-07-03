-- CreateTable
CREATE TABLE `subscription_plans` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `code` VARCHAR(80) NOT NULL,
    `account_type` ENUM('ESTABLISHMENT', 'INDEPENDENT_DOCTOR') NOT NULL,
    `description` TEXT NULL,
    `monthly_price` INTEGER NULL,
    `annual_price` INTEGER NULL,
    `currency` VARCHAR(8) NOT NULL DEFAULT 'DZD',
    `features` JSON NULL,
    `limits` JSON NULL,
    `recommended` BOOLEAN NOT NULL DEFAULT false,
    `custom` BOOLEAN NOT NULL DEFAULT false,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `subscription_plans_code_key`(`code`),
    INDEX `subscription_plans_account_type_idx`(`account_type`),
    INDEX `subscription_plans_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscriptions` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `plan_id` VARCHAR(191) NOT NULL,
    `account_type` ENUM('ESTABLISHMENT', 'INDEPENDENT_DOCTOR') NOT NULL,
    `status` ENUM('NO_PLAN', 'PAYMENT_PENDING', 'ACTIVE', 'EXPIRED', 'CANCELED') NOT NULL,
    `billing_period` ENUM('MONTHLY', 'ANNUAL') NOT NULL,
    `started_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NULL,
    `canceled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `subscriptions_user_id_idx`(`user_id`),
    INDEX `subscriptions_plan_id_idx`(`plan_id`),
    INDEX `subscriptions_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `subscription_id` VARCHAR(191) NULL,
    `plan_id` VARCHAR(191) NOT NULL,
    `account_type` ENUM('ESTABLISHMENT', 'INDEPENDENT_DOCTOR') NOT NULL,
    `method` ENUM('SYNTHETIC_CHARGILY', 'MANUAL_CASH', 'MANUAL_POST_TRANSFER', 'BARIDIMOB_RECEIPT') NOT NULL,
    `status` ENUM('CREATED', 'WAITING_PAYMENT', 'WAITING_ADMIN_REVIEW', 'PAID', 'REJECTED', 'FAILED', 'CANCELED', 'EXPIRED') NOT NULL,
    `amount` INTEGER NOT NULL,
    `currency` VARCHAR(8) NOT NULL DEFAULT 'DZD',
    `billing_period` ENUM('MONTHLY', 'ANNUAL') NOT NULL,
    `reference` VARCHAR(80) NOT NULL,
    `provider` VARCHAR(80) NULL,
    `provider_payment_id` VARCHAR(120) NULL,
    `provider_status` VARCHAR(80) NULL,
    `synthetic_mode` BOOLEAN NOT NULL DEFAULT true,
    `card_last4` VARCHAR(4) NULL,
    `card_holder_name` VARCHAR(120) NULL,
    `proof_document_id` VARCHAR(191) NULL,
    `admin_note` TEXT NULL,
    `rejection_reason` TEXT NULL,
    `paid_at` DATETIME(3) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `reviewed_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payments_reference_key`(`reference`),
    INDEX `payments_user_id_idx`(`user_id`),
    INDEX `payments_subscription_id_idx`(`subscription_id`),
    INDEX `payments_plan_id_idx`(`plan_id`),
    INDEX `payments_status_idx`(`status`),
    INDEX `payments_method_idx`(`method`),
    INDEX `payments_reviewed_by_id_idx`(`reviewed_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_proof_documents` (
    `id` VARCHAR(191) NOT NULL,
    `payment_id` VARCHAR(191) NOT NULL,
    `document_type` ENUM('POST_TRANSFER_PROOF', 'BARIDIMOB_RECEIPT') NOT NULL,
    `original_name` VARCHAR(255) NOT NULL,
    `stored_name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `size` INTEGER NOT NULL,
    `local_path` VARCHAR(500) NOT NULL,
    `checksum` VARCHAR(128) NULL,
    `uploaded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payment_proof_documents_payment_id_key`(`payment_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_reviewed_by_id_fkey` FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_proof_documents` ADD CONSTRAINT `payment_proof_documents_payment_id_fkey` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
