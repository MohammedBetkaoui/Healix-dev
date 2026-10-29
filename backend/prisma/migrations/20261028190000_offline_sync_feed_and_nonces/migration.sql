-- Offline-first hardening: the change feed widens to PATIENT (cloud ->
-- desktop, read-only) and APPOINTMENT (cloud -> desktop, read-only), and
-- durable nonces back the device proof-of-possession of the sync API.
-- Widening the enum keeps the existing 'CONSULTATION' rows untouched.

ALTER TABLE `sync_operations`
  MODIFY COLUMN `entity_type` ENUM('PATIENT', 'CONSULTATION', 'APPOINTMENT') NOT NULL;

ALTER TABLE `sync_entity_maps`
  MODIFY COLUMN `entity_type` ENUM('PATIENT', 'CONSULTATION', 'APPOINTMENT') NOT NULL;

ALTER TABLE `sync_changes`
  MODIFY COLUMN `entity_type` ENUM('PATIENT', 'CONSULTATION', 'APPOINTMENT') NOT NULL;

CREATE TABLE `device_request_nonces` (
  `nonce` VARCHAR(64) NOT NULL,
  `device_id` VARCHAR(191) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `device_request_nonces_device_id_expires_at_idx` (`device_id`, `expires_at`),
  PRIMARY KEY (`nonce`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
