-- Replace TOTP MFA with email-OTP 2FA.
-- Drop TOTP columns (secret ciphertext, recovery-code hashes, enabled flag)...
ALTER TABLE "User" DROP COLUMN "isMfaEnabled";
ALTER TABLE "User" DROP COLUMN "mfaSecret";
ALTER TABLE "User" DROP COLUMN "mfaRecoveryCodes";

-- ...and add the email-OTP columns (hashed single-use code + expiry + attempt counter).
ALTER TABLE "User" ADD COLUMN "mfaCodeHash" TEXT;
ALTER TABLE "User" ADD COLUMN "mfaCodeExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "mfaCodeAttempts" INTEGER NOT NULL DEFAULT 0;
