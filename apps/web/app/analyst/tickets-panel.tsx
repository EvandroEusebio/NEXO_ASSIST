"use client"

import { useState } from "react"
import {
  ArrowUpRight,
  ChevronRight,
  Headphones,
  ArrowLeftRight,
  X,
} from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"
import type { AnalystDetail } from "../../../../src/contracts/analyst"
import {
  categoryLabels,
  priorityLabels,
  statusLabels,
} from "../../../../src/contracts/chat"

type Ticket = AnalystDetail["tickets"][number]
const closed = (t: Ticket) => ["CLOSED", "RESOLVED"].includes(t.status)
const dot = (t: Ticket) =>
  closed(t)
    ? "bg-gray-300"
    : t.status === "APPROVED"
      ? "bg-emerald-500"
      : t.status === "WAITING_ANALYST"
        ? "bg-amber-500"
        : "bg-blue-500"
const date = (s: string) =>
  new Date(s).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
const events: Record<string, string> = {
  CREATED: "Chamado criado",
  UPDATED: "Chamado atualizado",
  REOPENED: "Chamado reaberto",
  TRANSFERRED: "Transferido para um analista",
  ASSIGNED: "Atendimento assumido",
  ANALYST_RESPONSE: "Resposta do analista",
  RETURNED_TO_AGENT: "Devolvido ao assistente",
  RESOLVED: "Chamado resolvido",
  CLOSED: "Chamado encerrado",
}
export function AnalystTickets({
  detail,
  showTickets,
  onClose,
}: {
  detail: AnalystDetail
  showTickets: boolean
  onClose: () => void
}) {
  const [view, setView] = useState<string | null>(null)
  const linked = detail.tickets.find((t) => t.number === detail.handoff?.number)
  const others = detail.tickets.filter((t) => t.id !== linked?.id)
  const open = detail.tickets.filter((t) => !closed(t)).length
  const active = detail.status === "ANALYST_ACTIVE"
  const assignment = linked?.events.find(
    (e) => e.action === (active ? "ASSIGNED" : "TRANSFERRED")
  )
  const linkedStatus = linked
    ? active && !closed(linked)
      ? "Em atendimento"
      : statusLabels[linked.status]
    : ""
  const assignmentLabel =
    active && detail.assignedAnalyst
      ? `Assumido por ${detail.assignedAnalyst.name}`
      : linked?.status === "WAITING_ANALYST"
        ? "Transferido para um analista"
        : linkedStatus
  const chosen = detail.tickets.find((t) => t.id === view)
  function row(t: Ticket) {
    return (
      <Button
        key={t.id}
        variant="ghost"
        onClick={() => setView(t.id)}
        className="group h-auto min-h-16 w-full justify-start gap-3 rounded-none border-0 border-b border-[#e8ebef] px-0 py-3 text-left font-normal whitespace-normal transition-colors last:border-0 hover:bg-[#f6f7f9] focus-visible:relative focus-visible:z-10"
        aria-label={`${t.number}: ${t.title}`}
      >
        <span className={`size-1.5 shrink-0 rounded-full ${dot(t)}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm leading-5 text-[#1b2431]">
            {t.title}
          </span>
          <span className="block text-xs leading-4 text-[#637087]">
            {t.number} · {statusLabels[t.status]}
            {closed(t) && t.resolvedAt
              ? ` em ${new Date(t.resolvedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`
              : ""}
          </span>
        </span>
        <ChevronRight className="size-3.5 shrink-0 text-[#637087] transition-transform group-hover:translate-x-0.5" />
      </Button>
    )
  }
  return (
    <aside
      className={`${showTickets ? "fixed inset-y-0 right-0 z-20 flex w-80 shadow-xl" : "hidden w-85"} min-h-0 max-w-full shrink-0 flex-col border-l border-[#e8ebef] bg-white text-[#1b2431] xl:static xl:flex xl:w-85 xl:shadow-none`}
      aria-label="Chamados do utilizador"
    >
      <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[#e8ebef] pr-4 pl-5">
        <div>
          <h2 className="text-[15px] leading-5 font-semibold tracking-[-0.01em]">
            Chamados de {detail.employee.name.split(" ")[0]}
          </h2>
          <p className="mt-0.5 text-xs leading-4 text-[#637087]">
            {open} abertos · {detail.tickets.length - open} encerrados
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Fechar chamados"
          className="size-8 shrink-0 rounded-lg text-[#637087] hover:bg-[#f6f7f9]"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-6 pb-5">
        <p className="mb-3 text-xs leading-4 font-medium text-[#637087]">
          Desta conversa
        </p>
        {linked ? (
          <button
            type="button"
            onClick={() => setView(linked.id)}
            className="mb-8 w-full cursor-pointer rounded-[14px] bg-[#f6f7f9] p-4 text-left transition-colors hover:bg-[#eef1f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span className="flex items-center justify-between gap-2 text-[11px] leading-4">
              <span className="text-slate-500">{linked.number}</span>
              <span
                className={`flex shrink-0 items-center gap-1.5 font-medium ${active && !closed(linked) ? "text-[#0064ce]" : closed(linked) ? "text-[#637087]" : "text-[#946300]"}`}
              >
                <span
                  className={`size-1.5 rounded-full ${active && !closed(linked) ? "bg-[#0064ce]" : dot(linked)}`}
                  aria-hidden="true"
                />
                {linkedStatus}
              </span>
            </span>
            <strong className="mt-1 block text-sm leading-5 font-semibold">
              {linked.title}
            </strong>
            <span className="mt-1 block text-[13px] leading-4.5 text-[#637087]">
              {categoryLabels[linked.category]} · prioridade{" "}
              {priorityLabels[linked.priority]?.toLowerCase()}
            </span>
            <span className="mt-4 flex min-w-0 items-center gap-2 border-t border-[#e3e7ed] pt-3 text-xs leading-4 text-[#566176]">
              {active ? (
                <Headphones className="size-3.5 shrink-0" />
              ) : (
                <ArrowLeftRight className="size-3.5 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate" title={assignmentLabel}>
                {assignmentLabel}
              </span>
              {assignment && (
                <time
                  className="shrink-0 text-[11px] text-[#637087]"
                  dateTime={assignment.createdAt}
                >
                  {new Date(assignment.createdAt).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              )}
            </span>
          </button>
        ) : (
          <p className="mb-8 text-xs text-slate-500">
            Nenhum chamado vinculado a este atendimento.
          </p>
        )}
        <h3 className="mb-1 text-xs leading-4 font-medium text-[#637087]">
          Outros chamados
        </h3>
        {others.map(row)}
        {!others.length && (
          <p className="mt-4 text-xs text-slate-500">Nenhum outro chamado.</p>
        )}
      </div>
      <div className="mt-auto shrink-0 bg-white px-4 pt-3 pb-4">
        <Button
          variant="outline"
          className="h-9 w-full gap-2 rounded-[9px] border-[#e3e7ed] bg-white px-2 text-[13px] font-normal text-[#3d4656] shadow-[0_1px_2px_#1b243108] hover:bg-[#f6f7f9]"
          onClick={() => setView("all")}
        >
          Ver todos os chamados de {detail.employee.name.split(" ")[0]}{" "}
          <ArrowUpRight className="size-3" />
        </Button>
      </div>
      <Dialog
        open={view !== null}
        onOpenChange={(open) => {
          if (!open) setView(null)
        }}
      >
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {chosen
                ? `${chosen.number} · ${chosen.title}`
                : `Chamados de ${detail.employee.name}`}
            </DialogTitle>
            <DialogDescription>
              {chosen
                ? `${categoryLabels[chosen.category]} · ${statusLabels[chosen.status]} · prioridade ${priorityLabels[chosen.priority]?.toLowerCase()}`
                : `${detail.tickets.length} chamados deste utilizador`}
            </DialogDescription>
          </DialogHeader>
          {chosen ? (
            <>
              <p className="text-sm whitespace-pre-wrap">
                {chosen.description}
              </p>
              <p className="text-xs text-slate-500">
                Aberto em {date(chosen.createdAt)}
                {chosen.nextResponseDueAt
                  ? ` · Prazo: ${date(chosen.nextResponseDueAt)}`
                  : ""}
              </p>
              <h3 className="text-sm font-medium">Histórico do chamado</h3>
              {chosen.events.map((e) => (
                <p key={e.id} className="border-t pt-2 text-xs">
                  {date(e.createdAt)} · {events[e.action] ?? e.action}
                </p>
              ))}
              <Button variant="outline" onClick={() => setView("all")}>
                Ver todos os chamados
              </Button>
            </>
          ) : (
            <div>
              {detail.tickets.map(row)}
              {!detail.tickets.length && (
                <p className="text-sm text-slate-500">
                  Nenhum chamado cadastrado.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </aside>
  )
}
