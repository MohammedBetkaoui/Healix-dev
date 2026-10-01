-- Phase A is intentionally additive and non-destructive.
-- Legacy tenant columns stay in place until the workspace backfill has been
-- validated in every environment.

-- CreateTable
CREATE TABLE `workspaces` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('ESTABLISHMENT', 'PRIVATE_PRACTICE') NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `establishment_id` VARCHAR(191) NULL,
    `owner_doctor_profile_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `workspaces_establishment_id_key`(`establishment_id`),
    UNIQUE INDEX `workspaces_owner_doctor_profile_id_key`(`owner_doctor_profile_id`),
    INDEX `workspaces_type_idx`(`type`),
    INDEX `workspaces_establishment_id_idx`(`establishment_id`),
    INDEX `workspaces_owner_doctor_profile_id_idx`(`owner_doctor_profile_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workspace_memberships` (
    `id` VARCHAR(191) NOT NULL,
    `workspace_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'ADMIN', 'DOCTOR', 'RECEPTIONIST') NOT NULL,
    `status` ENUM('ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `workspace_memberships_user_id_idx`(`user_id`),
    INDEX `workspace_memberships_workspace_id_idx`(`workspace_id`),
    UNIQUE INDEX `workspace_memberships_workspace_id_user_id_key`(`workspace_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `patients` ADD COLUMN `workspace_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `patients_workspace_id_idx` ON `patients`(`workspace_id`);

-- AddForeignKey
ALTER TABLE `workspaces` ADD CONSTRAINT `workspaces_establishment_id_fkey` FOREIGN KEY (`establishment_id`) REFERENCES `establishments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspaces` ADD CONSTRAINT `workspaces_owner_doctor_profile_id_fkey` FOREIGN KEY (`owner_doctor_profile_id`) REFERENCES `doctor_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_memberships` ADD CONSTRAINT `workspace_memberships_workspace_id_fkey` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_memberships` ADD CONSTRAINT `workspace_memberships_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `patients` ADD CONSTRAINT `patients_workspace_id_fkey` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill one workspace per existing establishment.
INSERT INTO `workspaces` (
    `id`,
    `type`,
    `name`,
    `establishment_id`,
    `owner_doctor_profile_id`,
    `created_at`,
    `updated_at`
)
SELECT
    CONCAT('ws_', REPLACE(UUID(), '-', '')),
    'ESTABLISHMENT',
    e.`name`,
    e.`id`,
    NULL,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
FROM `establishments` e
LEFT JOIN `workspaces` w ON w.`establishment_id` = e.`id`
WHERE w.`id` IS NULL;

-- Establishment owners become workspace owners.
INSERT INTO `workspace_memberships` (
    `id`,
    `workspace_id`,
    `user_id`,
    `role`,
    `status`,
    `created_at`,
    `updated_at`
)
SELECT
    CONCAT('wsm_', REPLACE(UUID(), '-', '')),
    w.`id`,
    e.`owner_id`,
    'OWNER',
    'ACTIVE',
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
FROM `workspaces` w
INNER JOIN `establishments` e ON e.`id` = w.`establishment_id`
LEFT JOIN `workspace_memberships` wm
    ON wm.`workspace_id` = w.`id` AND wm.`user_id` = e.`owner_id`
WHERE w.`type` = 'ESTABLISHMENT' AND wm.`id` IS NULL;

-- Existing affiliated doctors become DOCTOR members of their establishment.
INSERT INTO `workspace_memberships` (
    `id`,
    `workspace_id`,
    `user_id`,
    `role`,
    `status`,
    `created_at`,
    `updated_at`
)
SELECT
    CONCAT('wsm_', REPLACE(UUID(), '-', '')),
    w.`id`,
    dp.`user_id`,
    'DOCTOR',
    'ACTIVE',
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
FROM `doctor_profiles` dp
INNER JOIN `workspaces` w ON w.`establishment_id` = dp.`establishment_id`
LEFT JOIN `workspace_memberships` wm
    ON wm.`workspace_id` = w.`id` AND wm.`user_id` = dp.`user_id`
WHERE dp.`establishment_id` IS NOT NULL AND wm.`id` IS NULL;

-- Each independent doctor receives a private-practice workspace.
INSERT INTO `workspaces` (
    `id`,
    `type`,
    `name`,
    `establishment_id`,
    `owner_doctor_profile_id`,
    `created_at`,
    `updated_at`
)
SELECT
    CONCAT('ws_', REPLACE(UUID(), '-', '')),
    'PRIVATE_PRACTICE',
    COALESCE(NULLIF(TRIM(u.`full_name`), ''), 'Cabinet médical'),
    NULL,
    dp.`id`,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
FROM `doctor_profiles` dp
INNER JOIN `users` u ON u.`id` = dp.`user_id`
LEFT JOIN `workspaces` w ON w.`owner_doctor_profile_id` = dp.`id`
WHERE dp.`is_independent` = true
    AND u.`role` = 'INDEPENDENT_DOCTOR'
    AND w.`id` IS NULL;

-- Independent doctors own their private-practice workspace.
INSERT INTO `workspace_memberships` (
    `id`,
    `workspace_id`,
    `user_id`,
    `role`,
    `status`,
    `created_at`,
    `updated_at`
)
SELECT
    CONCAT('wsm_', REPLACE(UUID(), '-', '')),
    w.`id`,
    dp.`user_id`,
    'OWNER',
    'ACTIVE',
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
FROM `workspaces` w
INNER JOIN `doctor_profiles` dp ON dp.`id` = w.`owner_doctor_profile_id`
LEFT JOIN `workspace_memberships` wm
    ON wm.`workspace_id` = w.`id` AND wm.`user_id` = dp.`user_id`
WHERE w.`type` = 'PRIVATE_PRACTICE' AND wm.`id` IS NULL;

-- Establishment ownership takes precedence when both legacy columns happen to
-- be populated. The private-practice relation is used only as a fallback.
UPDATE `patients` p
INNER JOIN `workspaces` w ON w.`establishment_id` = p.`establishment_id`
SET p.`workspace_id` = w.`id`
WHERE p.`workspace_id` IS NULL AND p.`establishment_id` IS NOT NULL;

UPDATE `patients` p
INNER JOIN `workspaces` w ON w.`owner_doctor_profile_id` = p.`doctor_profile_id`
SET p.`workspace_id` = w.`id`
WHERE p.`workspace_id` IS NULL AND p.`doctor_profile_id` IS NOT NULL;

