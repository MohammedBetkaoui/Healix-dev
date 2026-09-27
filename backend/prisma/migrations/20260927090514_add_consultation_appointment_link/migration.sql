-- AlterTable
ALTER TABLE `patient_consultations` ADD COLUMN `appointment_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `patient_consultations_appointment_id_key` ON `patient_consultations`(`appointment_id`);

-- AddForeignKey
ALTER TABLE `patient_consultations` ADD CONSTRAINT `patient_consultations_appointment_id_fkey` FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
