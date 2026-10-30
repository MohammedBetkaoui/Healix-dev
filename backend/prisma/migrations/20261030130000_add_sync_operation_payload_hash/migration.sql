-- A legacy row may have been processed before semantic payload hashes existed.
-- It gets a deterministic *legacy marker*, never a fake canonical hash. An
-- incoming retry cannot match it and is therefore conservatively rejected.
ALTER TABLE `sync_operations`
  ADD COLUMN `payload_hash` VARCHAR(64) NULL;

UPDATE `sync_operations`
  SET `payload_hash` = SHA2(CONCAT('legacy-sync-operation:', `operation_id`), 256)
  WHERE `payload_hash` IS NULL;

ALTER TABLE `sync_operations`
  MODIFY COLUMN `payload_hash` VARCHAR(64) NOT NULL;
