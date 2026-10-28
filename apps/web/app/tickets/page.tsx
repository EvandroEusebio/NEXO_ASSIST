import Link from "next/link"
import { redirect } from "next/navigation"
import { getPrismaClient } from "../../../../src/lib/prisma"
import { createTicketService } from "../../../../src/services/tickets"
import { currentEmployee } from "@/lib/auth"
import { LogoutButton } from "./logout-button"
import { Badge } from "@workspace/ui/components/badge"
import { Card } from "@workspace/ui/components/card"

const labels: Record<string, string> = {
  OPEN: "Aberto",
  IN_PROGRESS: "Em andamento",
  WAITING_ANALYST: "Aguardando analista",
  APPROVED: "Aprovado",
  RESOLVED: "Resolvido",
  CLOSED: "Encerrado",
}

export default async function TicketsPage() {
  const user = await currentEmployee()
  if (!user) redirect("/login")
  const tickets = await createTicketService(getPrismaClient()).list(user.id)

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-[#1b2431]">
      <header className="border-b border-[#e6e8ec] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-5">
          <Link href="/tickets" className="flex items-center gap-2 font-bold">
            <span className="grid size-8 place-items-center rounded-lg bg-[#037af6] text-white">
              N
            </span>
            NEXO <span className="font-normal">ASSIST</span>
          </Link>
          <div className="flex items-center gap-5">
            <span className="hidden text-sm text-[#5b6472] sm:block">
              {user.name}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-sm font-semibold tracking-[0.15em] text-[#0069c7] uppercase">
          Área do funcionário
        </p>
        <h1 className="mt-2 font-serif text-4xl">Meus chamados</h1>
        <p className="mt-3 text-[#5b6472]">
          Consulte o andamento dos chamados abertos por si.
        </p>
        <Card className="mt-8 gap-0 overflow-hidden rounded-xl border border-[#e6e8ec] bg-white py-0 shadow-none ring-0">
          {tickets.length === 0 ? (
            <p className="p-6 text-[#5b6472]">
              Ainda não há chamados associados à sua conta.
            </p>
          ) : (
            <ul className="divide-y divide-[#e6e8ec]">
              {tickets.map((ticket) => (
                <li key={ticket.id}>
                  <Link
                    href={`/tickets/${encodeURIComponent(ticket.number)}`}
                    className="flex flex-col gap-2 px-6 py-5 transition hover:bg-[#edf6fe] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span>
                      <span className="block text-xs font-semibold text-[#0069c7]">
                        {ticket.number}
                      </span>
                      <span className="mt-1 block font-medium">
                        {ticket.title}
                      </span>
                    </span>
                    <Badge
                      variant="secondary"
                      className="bg-[#f6f7f9] text-sm font-normal text-[#3d4656]"
                    >
                      {labels[ticket.status]}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </main>
  )
}
