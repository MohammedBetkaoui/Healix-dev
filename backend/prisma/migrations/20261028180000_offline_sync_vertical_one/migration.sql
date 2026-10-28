-- Offline-first V1, vertical one: authorised devices, signed grants,
-- idempotent consultation operations and an opaque-cursor change feed.

ALTER TABLE `patient_consultations`
  ADD COLUMN `sync_version` INTEGER NOT NULL DEFAULT 1;

CREATE TABLE `offline_devices` (
  `id` VARCHAR(191) NOT NULL,
  `installation_id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `workspace_id` VARCHAR(191) NOT NULL,
  `device_name` VARCHAR(120) NOT NULL,
  `platform` VARCHAR(40) NOT NULL,
  `public_key` TEXT NOT NULL,
  `registered_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `revoked_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `offline_devices_user_id_workspace_id_installation_id_key` (`user_id`, `workspace_id`, `installation_id`),
  INDEX `offline_devices_workspace_id_idx` (`workspace_id`),
  INDEX `offline_devices_user_id_idx` (`user_id`),
  INDEX `offline_devices_revoked_at_idx` (`revoked_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `offline_access_grants` (
  `id` VARCHAR(191) NOT NULL,
  `device_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `workspace_id` VARCHAR(191) NOT NULL,
  `role` ENUM('SUPER_ADMIN', 'ADMIN_VERIFICATION', 'ESTABLISHMENT_ADMIN', 'AFFILIATED_DOCTOR', 'INDEPENDENT_DOCTOR') NOT NULL,
  `offline_capabilities` JSON NOT NULL,
  `offline_scope` JSON NOT NULL,
  `issued_at` DATETIME(3) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `revoked_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `offline_access_grants_device_id_idx` (`device_id`),
  INDEX `offline_access_grants_user_id_idx` (`user_id`),
  INDEX `offline_access_grants_workspace_id_idx` (`workspace_id`),
  INDEX `offline_access_grants_expires_at_idx` (`expires_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `sync_operations` (
  `operation_id` VARCHAR(64) NOT NULL,
  `device_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `workspace_id` VARCHAR(191) NOT NULL,
  `entity_type` ENUM('CONSULTATION') NOT NULL,
  `local_entity_id` VARCHAR(64) NOT NULL,
  `operation` ENUM('CREATE', 'UPDATE') NOT NULL,
  `base_version` INTEGER NULL,
  `payload` JSON NOT NULL,
  `client_occurred_at` DATETIME(3) NOT NULL,
  `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `status` ENUM('PROCESSING', 'ACK', 'CONFLICT', 'REJECTED', 'RETRYABLE') NOT NULL DEFAULT 'PROCESSING',
  `result` JSON NULL,
  `processed_at` DATETIME(3) NULL,

  INDEX `sync_operations_device_id_received_at_idx` (`device_id`, `received_at`),
  INDEX `sync_operations_workspace_id_received_at_idx` (`workspace_id`, `received_at`),
  INDEX `sync_operations_status_idx` (`status`),
  PRIMARY KEY (`operation_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `sync_entity_maps` (
  `id` VARCHAR(191) NOT NULL,
  `device_id` VARCHAR(191) NOT NULL,
  `entity_type` ENUM('CONSULTATION') NOT NULL,
  `local_entity_id` VARCHAR(64) NOT NULL,
  `server_entity_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `sync_entity_maps_device_id_entity_type_local_entity_id_key` (`device_id`, `entity_type`, `local_entity_id`),
  INDEX `sync_entity_maps_server_entity_id_idx` (`server_entity_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `sync_changes` (
  `sequence` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `workspace_id` VARCHAR(191) NOT NULL,
  `patient_id` VARCHAR(191) NULL,
  `entity_type` ENUM('CONSULTATION') NOT NULL,
  `entity_id` VARCHAR(191) NOT NULL,
  `operation` ENUM('CREATE', 'UPDATE', 'TOMBSTONE') NOT NULL,
  `payload` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `sync_changes_workspace_id_sequence_idx` (`workspace_id`, `sequence`),
  INDEX `sync_changes_workspace_id_patient_id_sequence_idx` (`workspace_id`, `patient_id`, `sequence`),
  PRIMARY KEY (`sequence`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `sync_device_states` (
  `id` VARCHAR(191) NOT NULL,
  `device_id` VARCHAR(191) NOT NULL,
  `last_acknowledged_sequence` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `sync_device_states_device_id_key` (`device_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `offline_devices`
  ADD CONSTRAINT `offline_devices_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `offline_devices_workspace_id_fkey` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `offline_access_grants`
  ADD CONSTRAINT `offline_access_grants_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `offline_devices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `offline_access_grants_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `offline_access_grants_workspace_id_fkey` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `sync_operations`
  ADD CONSTRAINT `sync_operations_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `offline_devices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `sync_operations_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `sync_operations_workspace_id_fkey` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `sync_entity_maps`
  ADD CONSTRAINT `sync_entity_maps_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `offline_devices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `sync_changes`
  ADD CONSTRAINT `sync_changes_workspace_id_fkey` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `sync_device_states`
  ADD CONSTRAINT `sync_device_states_device_id_fkey` FOREIGN KEY (`device_id`) REFERENCES `offline_devices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
