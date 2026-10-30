CREATE TABLE "PresenceLease" (
  "sessionTokenHash" VARCHAR(64) NOT NULL,
  "tabId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "conversationId" UUID,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "typingUntil" TIMESTAMP(3),
  CONSTRAINT "PresenceLease_pkey" PRIMARY KEY ("sessionTokenHash", "tabId"),
  CONSTRAINT "PresenceLease_sessionTokenHash_fkey" FOREIGN KEY ("sessionTokenHash") REFERENCES "AuthSession"("tokenHash") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PresenceLease_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "PresenceLease_expiresAt_idx" ON "PresenceLease"("expiresAt");
CREATE INDEX "PresenceLease_conversationId_typingUntil_idx" ON "PresenceLease"("conversationId", "typingUntil");
CREATE TABLE "ConversationReadState" (
  "conversationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "lastReadAt" TIMESTAMP(3) NOT NULL,
  "lastReadMessageId" UUID NOT NULL,
  CONSTRAINT "ConversationReadState_pkey" PRIMARY KEY ("conversationId", "userId"),
  CONSTRAINT "ConversationReadState_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConversationReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ConversationReadState_userId_idx" ON "ConversationReadState"("userId");
