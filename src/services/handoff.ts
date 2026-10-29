import type { Prisma } from "../generated/prisma/client"

export type HandoffReason = "REQUESTED" | "CRITICAL" | "OVERDUE" | "UNCERTAIN"
export const handoffLabels: Record<HandoffReason, string> = {
  REQUESTED: "Pedido de atendimento humano",
  CRITICAL: "Chamado de prioridade crítica",
  OVERDUE: "Prazo de resposta vencido",
  UNCERTAIN: "O assistente precisa de apoio para decidir",
}

/** Called inside the transaction that locks the conversation. */
export async function handoffConversation(
  tx: Prisma.TransactionClient,
  conversationId: string,
  employeeId: string,
  reason: HandoffReason,
  number?: string
) {
  const changed = await tx.conversation.updateMany({
    where: { id: conversationId, employeeId, status: "AGENT_ACTIVE" },
    data: { status: "WAITING_ANALYST", assignedAnalystId: null },
  })
  if (!changed.count) return
  const messages = await tx.message.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 12,
  })
  const reference =
    number ??
    messages.flatMap((message) => {
      const metadata = message.metadata as { number?: string } | null
      return metadata?.number ? [metadata.number] : []
    })[0]
  const ticket = reference
    ? await tx.ticket.findFirst({
        where: { number: reference, openedById: employeeId },
      })
    : null
  const summary = [
    handoffLabels[reason],
    ...(ticket
      ? [`${ticket.number} · ${ticket.title} · ${ticket.priority}`]
      : []),
    ...messages
      .slice()
      .reverse()
      .filter((message) => message.author === "EMPLOYEE")
      .slice(-5)
      .map((message) => message.content.slice(0, 600)),
  ].join("\n")
  if (ticket && !["RESOLVED", "CLOSED"].includes(ticket.status)) {
    await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        status: "WAITING_ANALYST",
        events: {
          create: {
            actorId: employeeId,
            action: "TRANSFERRED",
            metadata: { reason, summary, previousStatus: ticket.status },
          },
        },
      },
    })
  }
  return tx.message.create({
    data: {
      conversationId,
      author: "SYSTEM",
      content: `${handoffLabels[reason]}. Encaminhei a conversa a um analista com o contexto. O assistente está pausado; pode acrescentar informações enquanto espera.`,
      metadata: {
        kind: "handoff",
        reason,
        summary,
        ...(ticket ? { number: ticket.number } : {}),
      },
      createdAt: new Date(
        Math.max(Date.now(), (messages[0]?.createdAt.getTime() ?? 0) + 1)
      ),
    },
  })
}
