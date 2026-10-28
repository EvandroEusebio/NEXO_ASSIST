ALTER TABLE "Conversation" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Message" ADD COLUMN "requestId" UUID, ADD COLUMN "metadata" JSONB;
CREATE UNIQUE INDEX "Message_requestId_key" ON "Message"("requestId");
