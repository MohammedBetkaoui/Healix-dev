-- CreateTable
CREATE TABLE `patients` (
    `id` VARCHAR(191) NOT NULL,
    `first_name` VARCHAR(100) NOT NULL,
    `first_name_ar` VARCHAR(100) NOT NULL,
    `last_name` VARCHAR(100) NOT NULL,
    `last_name_ar` VARCHAR(100) NOT NULL,
    `gender` ENUM('MALE', 'FEMALE') NOT NULL,
    `birth_date` DATETIME(3) NOT NULL,
    `national_id` VARCHAR(64) NOT NULL,
    `blood_group` ENUM('A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG') NULL,
    `phone` VARCHAR(32) NOT NULL,
    `email` VARCHAR(191) NULL,
    `address` VARCHAR(255) NOT NULL,
    `wilaya` VARCHAR(80) NOT NULL,
    `commune` VARCHAR(80) NOT NULL,
    `emergency_contact_name` VARCHAR(120) NOT NULL,
    `emergency_contact_phone` VARCHAR(32) NOT NULL,
    `insurance` ENUM('CNAS', 'CASNOS', 'UNINSURED', 'PRIVATE') NOT NULL,
    `insured_number` VARCHAR(64) NULL,
    `sector` ENUM('PRIVATE', 'PUBLIC', 'CONVENTIONED') NOT NULL,
    `hospital_record_number` VARCHAR(80) NULL,
    `status` ENUM('ACTIVE', 'FOLLOW_UP', 'NEW', 'URGENT') NOT NULL DEFAULT 'NEW',
    `administrative_status` ENUM('ACTIVE', 'INACTIVE', 'DECEASED') NOT NULL DEFAULT 'ACTIVE',
    `sms_enabled` BOOLEAN NOT NULL DEFAULT true,
    `establishment_id` VARCHAR(191) NULL,
    `doctor_profile_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `patients_establishment_id_idx`(`establishment_id`),
    INDEX `patients_doctor_profile_id_idx`(`doctor_profile_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `patients` ADD CONSTRAINT `patients_establishment_id_fkey` FOREIGN KEY (`establishment_id`) REFERENCES `establishments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `patients` ADD CONSTRAINT `patients_doctor_profile_id_fkey` FOREIGN KEY (`doctor_profile_id`) REFERENCES `doctor_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
