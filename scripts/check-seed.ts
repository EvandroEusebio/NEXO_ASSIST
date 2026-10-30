import "dotenv/config"
import { createPrismaClient } from "../src/lib/prisma"

const prisma = createPrismaClient()
const demoEmails = [
  "ana.souza@nexo.com.br",
  "bruno.tavares@nexo.com.br",
  "carla.mendes@nexo.com.br",
  "diego.ramos@nexo.com.br",
  "elisa.prado@nexo.com.br",
  "rafael.lima@nexo.com.br",
  "marta.alves@nexo.com.br",
  "joao.santos@nexo.com.br",
]
const articleIds = Array.from(
  { length: 8 },
  (_, index) => `8de6442f-719e-4be5-a918-${String(index + 1).padStart(12, "0")}`
)
const ticketNumbers = [
  "INC-20311",
  "INC-20298",
  "REQ-10442",
  "INC-20150",
  "INC-20517",
  "REQ-10510",
  "INC-20518",
  "INC-20480",
  "REQ-10522",
]

async function main() {
  try {
    const [users, articles, tickets] = await Promise.all([
      prisma.user.findMany({ where: { email: { in: demoEmails } } }),
      prisma.helpArticle.findMany({ where: { id: { in: articleIds } } }),
      prisma.ticket.findMany({ where: { number: { in: ticketNumbers } } }),
    ])

    const employeeCount = users.filter(
      (user) => user.role === "EMPLOYEE"
    ).length
    const analystCount = users.filter((user) => user.role === "ANALYST").length
    const ana = users.find((user) => user.email === "ana.souza@nexo.com.br")
    const byNumber = new Map(tickets.map((ticket) => [ticket.number, ticket]))
    const overdue = byNumber.get("INC-20311")
    const recentlyResolved = byNumber.get("INC-20150")
    const olderResolved = byNumber.get("INC-20480")
    const otherUserTicket = byNumber.get("INC-20517")
    const now = Date.now()
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000

    if (
      employeeCount !== 5 ||
      analystCount !== 3 ||
      users.filter((user) => user.demoLoginEnabled && user.passwordHash)
        .length !== 6 ||
      articles.length !== 8 ||
      tickets.length !== 9 ||
      !ana ||
      !overdue ||
      overdue.openedById !== ana.id ||
      !overdue.nextResponseDueAt ||
      overdue.nextResponseDueAt.getTime() >= now ||
      !recentlyResolved?.resolvedAt ||
      recentlyResolved.resolvedAt.getTime() <= sevenDaysAgo ||
      !olderResolved?.resolvedAt ||
      olderResolved.resolvedAt.getTime() >= sevenDaysAgo ||
      !otherUserTicket ||
      otherUserTicket.openedById === ana.id ||
      !tickets.some((ticket) => ticket.type === "INC") ||
      !tickets.some((ticket) => ticket.type === "REQ") ||
      new Set(tickets.map((ticket) => ticket.priority)).size !== 4 ||
      !articles.some(
        (article) =>
          article.title.includes("erro 809") &&
          article.content.includes("Windows 10") &&
          article.content.includes("Windows 11")
      )
    ) {
      throw new Error("Os dados não cobrem todos os cenários esperados")
    }

    console.log(
      "Seed verificado: 5 funcionários (3 com acesso), 3 analistas, 8 artigos e 9 chamados; cenários de atraso, reabertura e isolamento presentes."
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error("Falha na verificação do seed:", error)
  process.exitCode = 1
})
