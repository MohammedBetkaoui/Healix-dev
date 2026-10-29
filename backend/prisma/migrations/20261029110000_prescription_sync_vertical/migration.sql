-- Second offline-first vertical: desktops create and edit prescription
-- DRAFTs offline; the cloud stays the sole clinical and regulatory authority
-- (validation, ORD numbering and PDF generation are never done offline).
-- Widening the enum keeps the existing rows untouched.

ALTER TABLE `sync_operations`
  MODIFY COLUMN `entity_type` ENUM('PATIENT', 'CONSULTATION', 'APPOINTMENT', 'PRESCRIPTION') NOT NULL;

ALTER TABLE `sync_entity_maps`
  MODIFY COLUMN `entity_type` ENUM('PATIENT', 'CONSULTATION', 'APPOINTMENT', 'PRESCRIPTION') NOT NULL;

ALTER TABLE `sync_changes`
  MODIFY COLUMN `entity_type` ENUM('PATIENT', 'CONSULTATION', 'APPOINTMENT', 'PRESCRIPTION') NOT NULL;

ALTER TABLE `prescriptions`
  ADD COLUMN `sync_version` INTEGER NOT NULL DEFAULT 1;
