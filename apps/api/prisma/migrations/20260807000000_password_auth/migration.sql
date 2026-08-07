-- Replace OTP identity with password credentials while preserving user records.
ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
UPDATE "User" SET "username" = lower('user_' || replace("id"::text, '-', '')), "passwordHash" = '$2a$12$R9L7d6pT2v76pZ1XxRo5L.M3STREK5CtpQPiLdE/TkAAzM4PKS8NG' WHERE "username" IS NULL;
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "passwordHash" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "mobile" DROP NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email") WHERE "email" IS NOT NULL;
DROP INDEX IF EXISTS "User_mobile_role_key";
DROP TABLE IF EXISTS "OtpChallenge";
