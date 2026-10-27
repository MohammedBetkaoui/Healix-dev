-- Operational settings and workspace invitations are purely additive:
-- nothing here touches the verified legal identity of an establishment, and
-- existing verified affiliated doctors keep their VERIFIED status. The new
-- invitation flow only applies to future onboardings.

-- CreateTable
CREATE TABLE `establishment_settings` (
    `id` VARCHAR(191) NOT NULL,
    `establishment_id` VARCHAR(191) NOT NULL,
    `website` VARCHAR(191) NULL,
    `opening_hours` JSON NULL,
    `default_appointment_duration` INTEGER NOT NULL DEFAULT 30,
    `dpo_name` VARCHAR(120) NULL,
    `dpo_email` VARCHAR(191) NULL,
    `dpo_phone` VARCHAR(32) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `establishment_settings_establishment_id_key`(`establishment_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workspace_invitations` (
    `id` VARCHAR(191) NOT NULL,
    `workspace_id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'ADMIN', 'DOCTOR', 'RECEPTIONIST') NOT NULL,
    `invited_by_id` VARCHAR(191) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `accepted_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `workspace_invitations_token_hash_key`(`token_hash`),
    INDEX `workspace_invitations_workspace_id_idx`(`workspace_id`),
    INDEX `workspace_invitations_email_idx`(`email`),
    INDEX `workspace_invitations_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `establishment_settings` ADD CONSTRAINT `establishment_settings_establishment_id_fkey` FOREIGN KEY (`establishment_id`) REFERENCES `establishments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_invitations` ADD CONSTRAINT `workspace_invitations_workspace_id_fkey` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workspace_invitations` ADD CONSTRAINT `workspace_invitations_invited_by_id_fkey` FOREIGN KEY (`invited_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Every existing establishment receives its operational settings row with the
-- default appointment duration, so the first read never comes back empty.
INSERT INTO `establishment_settings` (
    `id`,
    `establishment_id`,
    `default_appointment_duration`,
    `created_at`,
    `updated_at`
)
SELECT
    CONCAT('ests_', REPLACE(UUID(), '-', '')),
    e.`id`,
    30,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
FROM `establishments` e
LEFT JOIN `establishment_settings` s ON s.`establishment_id` = e.`id`
WHERE s.`id` IS NULL;

-- Defensive: an establishment workspace whose owner has no OWNER membership
-- would leave the workspace unusable. Renamed or recreated environments keep
-- it fixed (same guarantee as the 20261001120000 backfill).
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
