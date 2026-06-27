-- AlterTable
ALTER TABLE `verification_documents` MODIFY `document_type` ENUM('COMMERCIAL_REGISTER', 'NIF_DOCUMENT', 'HEALTH_AUTHORIZATION', 'LEGAL_REPRESENTATIVE_ID', 'ADDRESS_PROOF', 'NIS_DOCUMENT', 'COMPANY_STATUTES', 'CNAS_CASNOS', 'MEDICAL_DIRECTOR_DOCUMENT', 'REPRESENTATIVE_NOMINATION', 'IDENTITY_DOCUMENT', 'MEDICAL_DEGREE', 'SPECIALITY_DEGREE', 'ORDRE_REGISTRATION', 'PRACTICE_AUTHORIZATION', 'CABINET_ADDRESS_PROOF', 'CASNOS_CERTIFICATE', 'CABINET_OPENING_AUTHORIZATION', 'PROFESSIONAL_PHOTO', 'STAMP_SIGNATURE', 'CABINET_OWNERSHIP_OR_RENTAL', 'GOOD_STANDING_CERTIFICATE') NOT NULL;

-- AlterTable
ALTER TABLE `verification_requests` ADD COLUMN `doctor_current_step` ENUM('IDENTITY', 'QUALIFICATION', 'PROFESSIONAL_REGISTRATION', 'PRACTICE_LOCATION', 'FISCAL_SOCIAL', 'DOCUMENTS_SUBMISSION') NULL,
    ADD COLUMN `doctor_profile_id` VARCHAR(191) NULL,
    MODIFY `establishment_id` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `doctor_verification_data` (
    `id` VARCHAR(191) NOT NULL,
    `verification_request_id` VARCHAR(191) NOT NULL,
    `full_name` VARCHAR(120) NOT NULL,
    `birth_date` DATETIME(3) NULL,
    `birth_place` VARCHAR(120) NULL,
    `nationality` VARCHAR(80) NULL,
    `nin_or_id_number` VARCHAR(80) NULL,
    `identity_document_type` ENUM('NATIONAL_ID_CARD', 'PASSPORT', 'DRIVING_LICENSE', 'OTHER') NULL,
    `phone` VARCHAR(32) NOT NULL,
    `professional_email` VARCHAR(191) NOT NULL,
    `wilaya` VARCHAR(80) NOT NULL,
    `commune` VARCHAR(80) NULL,
    `address` VARCHAR(255) NULL,
    `doctor_type` ENUM('GENERAL_PRACTITIONER', 'SPECIALIST') NULL,
    `speciality` VARCHAR(100) NOT NULL,
    `main_degree` VARCHAR(160) NULL,
    `university` VARCHAR(160) NULL,
    `graduation_year` INTEGER NULL,
    `speciality_degree` VARCHAR(160) NULL,
    `speciality_graduation_year` INTEGER NULL,
    `order_registration_number` VARCHAR(100) NULL,
    `regional_council` VARCHAR(160) NULL,
    `registration_wilaya` VARCHAR(80) NULL,
    `registration_date` DATETIME(3) NULL,
    `professional_status` ENUM('INDEPENDENT_PRIVATE_DOCTOR', 'PRIVATE_INDIVIDUAL_CABINET', 'PRIVATE_GROUP_CABINET', 'PUBLIC_WITH_COMPLEMENTARY_ACTIVITY', 'OTHER') NULL,
    `practice_authorization_number` VARCHAR(100) NULL,
    `authorization_authority` VARCHAR(160) NULL,
    `cabinet_name` VARCHAR(160) NULL,
    `cabinet_type` ENUM('INDIVIDUAL_CABINET', 'GROUP_CABINET', 'PRIVATE_CONSULTATION', 'TELECONSULTATION', 'OTHER') NULL,
    `cabinet_address` VARCHAR(255) NULL,
    `cabinet_wilaya` VARCHAR(80) NULL,
    `cabinet_commune` VARCHAR(80) NULL,
    `cabinet_phone` VARCHAR(32) NULL,
    `cabinet_email` VARCHAR(191) NULL,
    `health_direction_wilaya` VARCHAR(80) NULL,
    `cabinet_opening_authorization` VARCHAR(120) NULL,
    `nif` VARCHAR(80) NULL,
    `tax_center` VARCHAR(120) NULL,
    `casnos_number` VARCHAR(80) NULL,
    `fiscal_activity_type` ENUM('MEDICAL_LIBERAL_PROFESSION', 'INDIVIDUAL_MEDICAL_CABINET', 'GROUP_MEDICAL_CABINET', 'OTHER') NULL,
    `professional_rib` VARCHAR(80) NULL,
    `confirmation_accuracy` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `doctor_verification_data_verification_request_id_key`(`verification_request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `verification_requests_doctor_profile_id_key` ON `verification_requests`(`doctor_profile_id`);

-- CreateIndex
CREATE INDEX `verification_requests_doctor_profile_id_idx` ON `verification_requests`(`doctor_profile_id`);

-- AddForeignKey
ALTER TABLE `verification_requests` ADD CONSTRAINT `verification_requests_doctor_profile_id_fkey` FOREIGN KEY (`doctor_profile_id`) REFERENCES `doctor_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `doctor_verification_data` ADD CONSTRAINT `doctor_verification_data_verification_request_id_fkey` FOREIGN KEY (`verification_request_id`) REFERENCES `verification_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
