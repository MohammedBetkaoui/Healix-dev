-- AlterTable
ALTER TABLE `conversation_participants` ADD COLUMN `last_read_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `share_read_receipts` BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE `conversation_read_marks` (
    `id` VARCHAR(191) NOT NULL,
    `conversation_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `seq` INTEGER NOT NULL,
    `read_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `conversation_read_marks_conversation_id_user_id_seq_idx`(`conversation_id`, `user_id`, `seq`),
    INDEX `conversation_read_marks_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `conversation_read_marks` ADD CONSTRAINT `conversation_read_marks_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversation_read_marks` ADD CONSTRAINT `conversation_read_marks_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
