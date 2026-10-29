import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getPrismaClient } from "../../../../../src/lib/prisma"
import {
  createTicketService,
  TicketServiceError,
} from "../../../../../src/services/tickets"
import { isOverdue } from "../../../../../src/services/sla"
import { currentEmployee } from "@/lib/auth"
import { Card } from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"

const statusLabels: Record<string, string> = {
  OPEN: "Aberto",
  IN_PROGRESS: "Em andamento",
  WAITING_ANALYST: "Aguardando analista",
  APPROVED: "Aprovado",
  RESOLVED: "Resolvido",
  CLOSED: "Encerrado",
}
const priorityLabels: Record<string, string> = {
  CRITICAL: "Crítica",
  HIGH: "Alta",
  MEDIUM: "Média",
  LOW: "Baixa",
}

export default async function TicketPage({
  params,
}: {
  params: Promise<{ number: string }>
}) {
  const user = await currentEmployee()
  if (!user) redirect("/login")
  const { number } = await params
  let ticket
  try {
    ticket = await createTicketService(getPrismaClient()).get(user.id, number)
  } catch (error) {
    if (error instanceof TicketServiceError && error.code === "NOT_FOUND")
      notFound()
    throw error
  }
  const overdue = isOverdue(ticket)
  const deadline = ticket.nextResponseDueAt
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: process.env.SLA_TIME_ZONE ?? "America/Sao_Paulo",
      }).format(ticket.nextResponseDueAt)
    : null

  return (
    <main className="min-h-screen bg-[#f6f7f9] px-6 py-12 text-[#1b2431]">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/tickets"
          className="text-sm font-medium text-[#0069c7] underline"
        >
          ← Voltar aos meus chamados
        </Link>
        <Card className="mt-6 rounded-xl border border-[#e6e8ec] bg-white p-6 shadow-none ring-0 sm:p-8">
          <p className="text-sm font-semibold text-[#0069c7]">
            {ticket.number}
          </p>
          <h1 className="mt-2 font-serif text-3xl">{ticket.title}</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="secondary">{statusLabels[ticket.status]}</Badge>
            <Badge variant="outline">{priorityLabels[ticket.priority]}</Badge>
            {overdue && (
              <Badge className="bg-[#fff2df] text-[#8a5200]">
                Prazo vencido
              </Badge>
            )}
          </div>
          <p className="mt-3 text-sm text-[#5b6472]">
            Próxima resposta: {deadline ?? "prazo não definido"}
            {deadline ? " (horário do calendário de atendimento)" : ""}
          </p>
          <p className="mt-8 leading-relaxed whitespace-pre-wrap text-[#3d4656]">
            {ticket.description}
          </p>
        </Card>
      </div>
    </main>
  )
}
