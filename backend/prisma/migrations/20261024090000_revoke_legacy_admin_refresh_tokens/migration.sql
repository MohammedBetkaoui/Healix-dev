-- The refresh tokens of the back-office admins are now hashed from their
-- SHA-256 too (src/auth/refresh-token-hash.ts), and each carries a unique jti.
-- Before, bcrypt hashed only the first 72 bytes of the token, where all the
-- tokens of an admin are the same: any refresh token of an admin matched their
-- newest session, so a revoked or already used token could still renew it, and
-- the sessions opened before cannot be told apart. None of them is recognized
-- by the new hash: they are closed, and the admins sign in again.
--
-- The previous migration (20261023180000_revoke_legacy_refresh_tokens) closed
-- the sessions of the users of the application only and left the admins out;
-- this one completes it. The roles are the two back-office ones of the
-- UserRole enum.
UPDATE `refresh_tokens`
SET `revoked_at` = CURRENT_TIMESTAMP(3)
WHERE `revoked_at` IS NULL
  AND `user_id` IN (
    SELECT `id` FROM `users`
    WHERE `role` IN ('SUPER_ADMIN', 'ADMIN_VERIFICATION')
  );
