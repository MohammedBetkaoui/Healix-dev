-- VerificationRequestType.AFFILIATED_DOCTOR: requests of doctors affiliated
-- to an establishment were all recorded as INDEPENDENT_DOCTOR before the type
-- existed. Only the enum widens here; the rows linked to a doctor profile of
-- an independent doctor keep INDEPENDENT_DOCTOR, establishment requests keep
-- ESTABLISHMENT.
ALTER TABLE `verification_requests` MODIFY COLUMN `type` ENUM('ESTABLISHMENT', 'INDEPENDENT_DOCTOR', 'AFFILIATED_DOCTOR') NOT NULL DEFAULT 'ESTABLISHMENT';

-- Backfill: a request of a doctor who belongs to an establishment
-- (doctor_profile_id set, is_independent = false) is an affiliated doctor's
-- request.
UPDATE `verification_requests` vr
  JOIN `doctor_profiles` dp ON dp.id = vr.doctor_profile_id
SET vr.`type` = 'AFFILIATED_DOCTOR'
WHERE vr.doctor_profile_id IS NOT NULL
  AND dp.is_independent = FALSE;
