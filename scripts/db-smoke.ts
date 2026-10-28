import "dotenv/config"
import { randomUUID } from "node:crypto"
import { createPrismaClient } from "../src/lib/prisma"

const suffix = randomUUID().slice(0, 8)
let writer = createPrismaClient()
let reader: ReturnType<typeof createPrismaClient> | undefined
let userId: string | undefined
let articleId: string | undefined

try {
  const user = await writer.user.create({
    data: {
      name: "Persistence smoke test",
      email: `smoke-${suffix}@example.invalid`,
    },
  })
  userId = user.id

  const article = await writer.helpArticle.create({
    data: {
      title: "Smoke test article",
      content: "Temporary article for the persistence check.",
      tags: ["smoke"],
    },
  })
  articleId = article.id

  const conversation = await writer.conversation.create({
    data: {
      employeeId: user.id,
      messages: {
        create: [
          {
            author: "EMPLOYEE",
            authorUserId: user.id,
            content: "Preciso de ajuda.",
          },
          {
            author: "AGENT",
            content: "Vou consultar a central de ajuda.",
            decision: {
              create: {
                intent: "HELP_REQUEST",
                action: "SEARCH_HELP_ARTICLES",
                confidence: 0.95,
                evidenceSummary: "Artigo de teste disponível.",
                reasonSummary: "O pedido é uma dúvida de TI.",
              },
            },
          },
        ],
      },
    },
  })

  await writer.conversation.update({
    where: { id: conversation.id },
    data: { status: "WAITING_ANALYST" },
  })

  await writer.$disconnect()
  reader = createPrismaClient()

  const persisted = await reader.conversation.findUniqueOrThrow({
    where: { id: conversation.id },
    include: { employee: true, messages: { include: { decision: true } } },
  })
  if (
    persisted.status !== "WAITING_ANALYST" ||
    persisted.employee.id !== user.id ||
    persisted.messages.length !== 2 ||
    persisted.messages.find((message) => message.author === "AGENT")?.decision
      ?.action !== "SEARCH_HELP_ARTICLES"
  ) {
    throw new Error("Conversation did not persist correctly after reconnection")
  }

  console.log(
    "Persistence check passed: user, conversation, messages, state and decision survived reconnection."
  )
} finally {
  const cleanup = reader ?? writer
  if (userId) {
    await cleanup.conversation.deleteMany({ where: { employeeId: userId } })
    await cleanup.user.delete({ where: { id: userId } })
  }
  if (articleId) {
    await cleanup.helpArticle.delete({ where: { id: articleId } })
  }
  await cleanup.$disconnect()
}
