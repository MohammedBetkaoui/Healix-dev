-- AlterTable
ALTER TABLE `doctor_profiles` MODIFY `verification_status` ENUM('NOT_STARTED', 'DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'SUSPENDED') NOT NULL;

-- AlterTable
ALTER TABLE `establishments` MODIFY `verification_status` ENUM('NOT_STARTED', 'DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'SUSPENDED') NOT NULL;

-- CreateTable
CREATE TABLE `verification_requests` (
    `id` VARCHAR(191) NOT NULL,
    `establishment_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `type` ENUM('ESTABLISHMENT', 'INDEPENDENT_DOCTOR') NOT NULL DEFAULT 'ESTABLISHMENT',
    `status` ENUM('NOT_STARTED', 'DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'SUSPENDED') NOT NULL DEFAULT 'DRAFT',
    `current_step` ENUM('ESTABLISHMENT_INFO', 'LEGAL_INFO', 'HEALTH_AUTHORIZATION', 'LEGAL_REPRESENTATIVE', 'DOCUMENTS', 'SUBMISSION') NOT NULL DEFAULT 'ESTABLISHMENT_INFO',
    `submitted_at` DATETIME(3) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `reviewed_by_id` VARCHAR(191) NULL,
    `rejection_reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `verification_requests_establishment_id_key`(`establishment_id`),
    INDEX `verification_requests_user_id_idx`(`user_id`),
    INDEX `verification_requests_reviewed_by_id_idx`(`reviewed_by_id`),
    INDEX `verification_requests_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `establishment_verification_data` (
    `id` VARCHAR(191) NOT NULL,
    `verification_request_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `type` ENUM('CLINIC', 'HOSPITAL', 'IMAGING_CENTER', 'LABORATORY', 'GROUP_PRACTICE') NOT NULL,
    `legal_form` VARCHAR(120) NULL,
    `wilaya` VARCHAR(80) NOT NULL,
    `commune` VARCHAR(80) NULL,
    `address` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(32) NOT NULL,
    `professional_email` VARCHAR(191) NOT NULL,
    `website` VARCHAR(191) NULL,
    `commercial_register_number` VARCHAR(80) NULL,
    `commercial_register_issued_at` DATETIME(3) NULL,
    `commercial_register_wilaya` VARCHAR(80) NULL,
    `nif` VARCHAR(80) NULL,
    `nis` VARCHAR(80) NULL,
    `tax_center` VARCHAR(120) NULL,
    `health_authorization_number` VARCHAR(100) NULL,
    `health_authorization_issued_at` DATETIME(3) NULL,
    `health_authorization_authority` VARCHAR(160) NULL,
    `health_direction_wilaya` VARCHAR(80) NULL,
    `authorized_activity_type` VARCHAR(160) NULL,
    `legal_representative_full_name` VARCHAR(120) NULL,
    `legal_representative_function` VARCHAR(120) NULL,
    `legal_representative_nin_or_id` VARCHAR(80) NULL,
    `legal_representative_phone` VARCHAR(32) NULL,
    `legal_representative_email` VARCHAR(191) NULL,
    `confirmation_accuracy` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `establishment_verification_data_verification_request_id_key`(`verification_request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `verification_documents` (
    `id` VARCHAR(191) NOT NULL,
    `verification_request_id` VARCHAR(191) NOT NULL,
    `document_type` ENUM('COMMERCIAL_REGISTER', 'NIF_DOCUMENT', 'HEALTH_AUTHORIZATION', 'LEGAL_REPRESENTATIVE_ID', 'ADDRESS_PROOF', 'NIS_DOCUMENT', 'COMPANY_STATUTES', 'CNAS_CASNOS', 'MEDICAL_DIRECTOR_DOCUMENT', 'REPRESENTATIVE_NOMINATION') NOT NULL,
    `original_name` VARCHAR(255) NOT NULL,
    `stored_name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `size` INTEGER NOT NULL,
    `local_path` VARCHAR(500) NOT NULL,
    `checksum` VARCHAR(128) NULL,
    `status` ENUM('READY', 'UPLOADED', 'REJECTED') NOT NULL DEFAULT 'UPLOADED',
    `uploaded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `verification_documents_verification_request_id_idx`(`verification_request_id`),
    UNIQUE INDEX `verification_documents_verification_request_id_document_type_key`(`verification_request_id`, `document_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `verification_requests` ADD CONSTRAINT `verification_requests_establishment_id_fkey` FOREIGN KEY (`establishment_id`) REFERENCES `establishments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `verification_requests` ADD CONSTRAINT `verification_requests_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `verification_requests` ADD CONSTRAINT `verification_requests_reviewed_by_id_fkey` FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `establishment_verification_data` ADD CONSTRAINT `establishment_verification_data_verification_request_id_fkey` FOREIGN KEY (`verification_request_id`) REFERENCES `verification_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `verification_documents` ADD CONSTRAINT `verification_documents_verification_request_id_fkey` FOREIGN KEY (`verification_request_id`) REFERENCES `verification_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
