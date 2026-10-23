-- Refresh tokens are now hashed from their SHA-256 (src/auth/refresh-token-hash.ts).
-- Before, bcrypt hashed only the first 72 bytes of the token, where all the
-- tokens of a user are the same: the sessions opened before cannot be told
-- apart, and none of them is recognized by the new hash. They are closed, so
-- that the list of the sessions of an account only holds sessions that can
-- still be used; their users sign in again. The back-office admins keep
-- theirs: their tokens are hashed as before.
UPDATE `refresh_tokens`
SET `revoked_at` = CURRENT_TIMESTAMP(3)
WHERE `revoked_at` IS NULL
  AND `user_id` IN (
    SELECT `id` FROM `users`
    WHERE `role` IN ('ESTABLISHMENT_ADMIN', 'INDEPENDENT_DOCTOR', 'AFFILIATED_DOCTOR')
  );
