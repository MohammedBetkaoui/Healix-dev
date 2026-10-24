-- Enforced subscriptions: the TRIALING status, the quotas of each plan, the
-- trial and custom quotas of a subscription, and its history.

-- AlterTable
ALTER TABLE `doctor_profiles` MODIFY `subscription_status` ENUM('NO_PLAN', 'PAYMENT_PENDING', 'ACTIVE', 'EXPIRED', 'CANCELED', 'TRIALING') NOT NULL;

-- AlterTable
ALTER TABLE `establishments` MODIFY `subscription_status` ENUM('NO_PLAN', 'PAYMENT_PENDING', 'ACTIVE', 'EXPIRED', 'CANCELED', 'TRIALING') NOT NULL;

-- AlterTable
ALTER TABLE `subscriptions` ADD COLUMN `custom_quotas` JSON NULL,
    ADD COLUMN `trial` BOOLEAN NOT NULL DEFAULT false,
    MODIFY `status` ENUM('NO_PLAN', 'PAYMENT_PENDING', 'ACTIVE', 'EXPIRED', 'CANCELED', 'TRIALING') NOT NULL;

-- Plan quotas: added nullable, filled for the existing rows (the seed is not
-- run again on a deployed database), then made required. The values are those
-- of src/subscriptions/plans/plan-catalog.ts, which a test compares with this
-- file. null is unlimited; "aiPipelines": null is every pipeline.
ALTER TABLE `subscription_plans` ADD COLUMN `quotas` JSON NULL;

UPDATE `subscription_plans` SET `quotas` = '{"maxPatients": 100, "aiAnalysesPerMonth": 20, "maxDoctors": 1, "aiPipelines": ["brain", "pathology-breast", "cardio-ecg"]}' WHERE `code` = 'DOCTOR_STARTER';
UPDATE `subscription_plans` SET `quotas` = '{"maxPatients": null, "aiAnalysesPerMonth": 100, "maxDoctors": 1, "aiPipelines": ["brain", "pathology-breast", "cardio-ecg"]}' WHERE `code` = 'DOCTOR_PRO';
UPDATE `subscription_plans` SET `quotas` = '{"maxPatients": null, "aiAnalysesPerMonth": 300, "maxDoctors": 1, "aiPipelines": null}' WHERE `code` = 'DOCTOR_PREMIUM_AI';
UPDATE `subscription_plans` SET `quotas` = '{"maxPatients": 500, "aiAnalysesPerMonth": 100, "maxDoctors": 5, "aiPipelines": null}' WHERE `code` = 'EST_BASIC_CLINIC';
UPDATE `subscription_plans` SET `quotas` = '{"maxPatients": null, "aiAnalysesPerMonth": 500, "maxDoctors": 20, "aiPipelines": null}' WHERE `code` = 'EST_PRO_CENTER';
UPDATE `subscription_plans` SET `quotas` = '{"maxPatients": null, "aiAnalysesPerMonth": 2000, "maxDoctors": 100, "aiPipelines": null}' WHERE `code` = 'EST_ENTERPRISE';
UPDATE `subscription_plans` SET `quotas` = '{"maxPatients": null, "aiAnalysesPerMonth": null, "maxDoctors": null, "aiPipelines": null}' WHERE `code` = 'EST_CUSTOM';
-- Any other plan: no limit (a plan added by hand keeps working).
UPDATE `subscription_plans` SET `quotas` = '{"maxPatients": null, "aiAnalysesPerMonth": null, "maxDoctors": null, "aiPipelines": null}' WHERE `quotas` IS NULL;

ALTER TABLE `subscription_plans` MODIFY `quotas` JSON NOT NULL;

-- CreateTable
CREATE TABLE `subscription_events` (
    `id` VARCHAR(191) NOT NULL,
    `subscription_id` VARCHAR(191) NOT NULL,
    `type` ENUM('TRIAL_STARTED', 'PURCHASED', 'RENEWED', 'PLAN_CHANGED', 'EXPIRED', 'CANCELED', 'TRIAL_EXTENDED', 'QUOTAS_CHANGED') NOT NULL,
    `from_status` ENUM('NO_PLAN', 'PAYMENT_PENDING', 'ACTIVE', 'EXPIRED', 'CANCELED', 'TRIALING') NULL,
    `to_status` ENUM('NO_PLAN', 'PAYMENT_PENDING', 'ACTIVE', 'EXPIRED', 'CANCELED', 'TRIALING') NULL,
    `from_plan_id` VARCHAR(191) NULL,
    `to_plan_id` VARCHAR(191) NULL,
    `from_expires_at` DATETIME(3) NULL,
    `to_expires_at` DATETIME(3) NULL,
    `payment_id` VARCHAR(191) NULL,
    `actor_id` VARCHAR(191) NULL,
    `reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `subscription_events_subscription_id_created_at_idx`(`subscription_id`, `created_at`),
    INDEX `subscription_events_from_plan_id_idx`(`from_plan_id`),
    INDEX `subscription_events_to_plan_id_idx`(`to_plan_id`),
    INDEX `subscription_events_payment_id_idx`(`payment_id`),
    INDEX `subscription_events_actor_id_idx`(`actor_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `subscription_events` ADD CONSTRAINT `subscription_events_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscription_events` ADD CONSTRAINT `subscription_events_from_plan_id_fkey` FOREIGN KEY (`from_plan_id`) REFERENCES `subscription_plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscription_events` ADD CONSTRAINT `subscription_events_to_plan_id_fkey` FOREIGN KEY (`to_plan_id`) REFERENCES `subscription_plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscription_events` ADD CONSTRAINT `subscription_events_payment_id_fkey` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscription_events` ADD CONSTRAINT `subscription_events_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- BACKFILL START
-- Every account already VERIFIED (establishment, or independent doctor) that
-- holds no live subscription gets a 14-day trial starting at the migration, so
-- that no existing (demo) account is locked out. Safe to run again: the trial
-- row and its event have ids derived from the account ("trial-<user id>"), and
-- an account that had its trial (even one that has ended) is never given a
-- second one. Reference plans: DOCTOR_PRO and EST_BASIC_CLINIC.
INSERT INTO `subscriptions` (`id`, `user_id`, `plan_id`, `account_type`, `status`, `billing_period`, `started_at`, `expires_at`, `canceled_at`, `trial`, `custom_quotas`, `created_at`, `updated_at`)
SELECT CONCAT('trial-', eligible.`user_id`), eligible.`user_id`, plan.`id`, eligible.`account_type`, 'TRIALING', 'MONTHLY', UTC_TIMESTAMP(3), DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 14 DAY), NULL, 1, NULL, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)
FROM (
    SELECT e.`owner_id` AS `user_id`, 'ESTABLISHMENT' AS `account_type`, 'EST_BASIC_CLINIC' AS `plan_code`
    FROM `establishments` e
    JOIN `users` u ON u.`id` = e.`owner_id`
    WHERE e.`verification_status` = 'VERIFIED' AND u.`account_status` NOT IN ('SUSPENDED', 'REJECTED')
    UNION ALL
    SELECT d.`user_id` AS `user_id`, 'INDEPENDENT_DOCTOR' AS `account_type`, 'DOCTOR_PRO' AS `plan_code`
    FROM `doctor_profiles` d
    JOIN `users` u ON u.`id` = d.`user_id`
    WHERE d.`is_independent` = 1 AND d.`verification_status` = 'VERIFIED' AND u.`account_status` NOT IN ('SUSPENDED', 'REJECTED')
) eligible
JOIN `subscription_plans` plan ON plan.`code` = eligible.`plan_code`
WHERE NOT EXISTS (
    SELECT 1 FROM `subscriptions` s WHERE s.`user_id` = eligible.`user_id` AND s.`status` IN ('ACTIVE', 'TRIALING')
)
AND NOT EXISTS (
    SELECT 1 FROM `subscriptions` s WHERE s.`id` = CONCAT('trial-', eligible.`user_id`)
);

INSERT INTO `subscription_events` (`id`, `subscription_id`, `type`, `from_status`, `to_status`, `from_plan_id`, `to_plan_id`, `from_expires_at`, `to_expires_at`, `payment_id`, `actor_id`, `reason`, `created_at`)
SELECT CONCAT('trial-evt-', s.`user_id`), s.`id`, 'TRIAL_STARTED', NULL, 'TRIALING', NULL, s.`plan_id`, NULL, s.`expires_at`, NULL, NULL, 'Essai gratuit de 14 jours accorde a la migration (compte deja verifie)', UTC_TIMESTAMP(3)
FROM `subscriptions` s
WHERE s.`id` = CONCAT('trial-', s.`user_id`)
AND NOT EXISTS (
    SELECT 1 FROM `subscription_events` ev WHERE ev.`id` = CONCAT('trial-evt-', s.`user_id`)
);

-- The status copied onto the account, while its trial lasts.
UPDATE `establishments` e
JOIN `subscriptions` s ON s.`id` = CONCAT('trial-', e.`owner_id`)
SET e.`subscription_status` = 'TRIALING'
WHERE s.`status` = 'TRIALING';

UPDATE `doctor_profiles` d
JOIN `subscriptions` s ON s.`id` = CONCAT('trial-', d.`user_id`)
SET d.`subscription_status` = 'TRIALING'
WHERE d.`is_independent` = 1 AND s.`status` = 'TRIALING';

-- Doctors affiliated to such an establishment follow its subscription.
UPDATE `doctor_profiles` d
JOIN `establishments` e ON e.`id` = d.`establishment_id`
JOIN `subscriptions` s ON s.`id` = CONCAT('trial-', e.`owner_id`)
SET d.`subscription_status` = 'TRIALING'
WHERE d.`is_independent` = 0 AND s.`status` = 'TRIALING';

UPDATE `users` u
JOIN `subscriptions` s ON s.`id` = CONCAT('trial-', u.`id`)
SET u.`account_status` = 'ACTIVE'
WHERE s.`status` = 'TRIALING' AND u.`account_status` IN ('VERIFIED_NO_PLAN', 'PAYMENT_PENDING');
-- BACKFILL END
