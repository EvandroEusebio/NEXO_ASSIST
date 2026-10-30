ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT,
ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

ALTER TABLE "AuthSession" ADD COLUMN "rememberMe" BOOLEAN NOT NULL DEFAULT true;

-- Sessions created before password verification must authenticate again.
DELETE FROM "AuthSession";
