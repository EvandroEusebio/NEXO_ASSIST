"use client"

import { useState } from "react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import {
  categoryLabels,
  priorityLabels,
  statusLabels,
  type ChatTicket,
} from "../../../../src/contracts/chat"
import { styles } from "./styles"

const timeZone = "Africa/Luanda"
export function ticketDate(value: string, withTime = true) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    ...(withTime ? ({ hour: "2-digit", minute: "2-digit" } as const) : {}),
    timeZone,
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ""
  return `${part("day")} ${part("month").replace(/\.$/, "")}${withTime ? `, ${part("hour")}:${part("minute")}` : ""}`
}
export function ticketAge(value: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000)
  )
  if (minutes < 1) return "agora"
  const amount =
    minutes >= 1440
      ? Math.floor(minutes / 1440)
      : minutes >= 60
        ? Math.floor(minutes / 60)
        : minutes
  return new Intl.RelativeTimeFormat("pt-BR", { numeric: "always" }).format(
    -amount,
    minutes >= 1440 ? "day" : minutes >= 60 ? "hour" : "minute"
  )
}
export const ticketOverdue = (ticket: ChatTicket) =>
  !!ticket.nextResponseDueAt &&
  !["RESOLVED", "CLOSED"].includes(ticket.status) &&
  new Date(ticket.nextResponseDueAt).getTime() < Date.now()
const statusColor = (status: string) =>
  status === "WAITING_ANALYST"
    ? "bg-amber-500"
    : status === "APPROVED"
      ? "bg-emerald-500"
      : ["CLOSED", "RESOLVED"].includes(status)
        ? "bg-slate-300"
        : "bg-[#1685ff]"

export function TicketCard({ ticket }: { ticket: ChatTicket }) {
  const overdue = ticketOverdue(ticket)
  return (
    <Card
      className={styles.card}
      aria-label={`Detalhes do chamado ${ticket.number}`}
    >
      <div className={styles.cardHeading}>
        <span>
          Chamado <span className="mx-1 text-slate-300">·</span> {ticket.number}
        </span>
        <Badge
          variant="secondary"
          className={`gap-1.5 border-0 bg-transparent p-0 text-xs font-normal ${ticket.status === "WAITING_ANALYST" ? "text-[#946300]" : "text-muted-foreground"}`}
        >
          <span
            className={`size-1.5 rounded-full ${statusColor(ticket.status)}`}
            aria-hidden="true"
          />
          {statusLabels[ticket.status]}
        </Badge>
      </div>
      <h3 className={styles.cardTitle}>{ticket.title}</h3>
      <p className={styles.cardDescription}>{ticket.description}</p>
      <dl className={styles.ticketFacts}>
        <div>
          <dt className={styles.factLabel}>Categoria</dt>
          <dd className={styles.factValue}>
            {categoryLabels[ticket.category]}
          </dd>
        </div>
        <div>
          <dt className={styles.factLabel}>Prioridade</dt>
          <dd className={`${styles.factValue} flex items-center gap-1.5`}>
            <span
              aria-hidden="true"
              className={`size-1.5 shrink-0 rounded-full ${ticket.priority === "CRITICAL" ? "bg-red-500" : ticket.priority === "HIGH" ? "bg-amber-500" : ticket.priority === "LOW" ? "bg-blue-500" : "bg-gray-400"}`}
            />
            {priorityLabels[ticket.priority]}
          </dd>
        </div>
        <div>
          <dt className={styles.factLabel}>Aberto em</dt>
          <dd className={styles.factValue}>
            <time dateTime={ticket.createdAt}>
              {ticketDate(ticket.createdAt)}
            </time>
          </dd>
        </div>
        <div>
          <dt className={styles.factLabel}>Última atualização</dt>
          <dd className={styles.factValue}>
            <time
              dateTime={ticket.updatedAt}
              title={ticketDate(ticket.updatedAt)}
              className={overdue ? styles.warning : undefined}
            >
              {ticketAge(ticket.updatedAt)}
            </time>
            {overdue && (
              <span className="text-[13px] text-muted-foreground">
                {" "}
                · prazo vencido
              </span>
            )}
          </dd>
        </div>
      </dl>
    </Card>
  )
}

export function TicketChoices({
  tickets,
  selected,
  disabled,
  readOnly = false,
  onSelect,
}: {
  tickets: ChatTicket[]
  selected?: string
  disabled: boolean
  readOnly?: boolean
  onSelect: (ticket: ChatTicket) => void
}) {
  const [inspectedNumber, setInspectedNumber] = useState<string | null>(null)
  const current = readOnly ? (inspectedNumber ?? selected) : selected
  const inspected = readOnly
    ? tickets.find((t) => t.number === inspectedNumber)
    : undefined
  return (
    <>
      <div className={styles.ticketList} aria-label="Seus chamados">
        {tickets.map((ticket) => (
          <Button
            key={ticket.number}
            variant="ghost"
            className={`${styles.ticketButton} ${current === ticket.number ? "bg-[#f4f8fc]" : "bg-white"}`}
            aria-pressed={current === ticket.number}
            aria-label={`${ticket.number}: ${ticket.title}`}
            disabled={disabled}
            onClick={() => {
              if (readOnly) setInspectedNumber(ticket.number)
              else onSelect(ticket)
            }}
          >
            <span
              aria-hidden="true"
              className={`${styles.radio} ${current === ticket.number ? "border-[5px] border-primary bg-white" : "border-[#cbd0d8]"}`}
            />
            <span className={styles.ticketMeta}>{ticket.number}</span>
            <span className={styles.ticketTitle}>{ticket.title}</span>
            <span
              className={`${styles.ticketMeta} inline-flex items-center justify-end gap-1.5`}
            >
              <span
                aria-hidden="true"
                className={`size-1.5 shrink-0 rounded-full ${statusColor(ticket.status)}`}
              />
              {statusLabels[ticket.status]}
            </span>
            <time
              className={`${styles.ticketMeta} text-right`}
              dateTime={ticket.createdAt}
            >
              {ticketDate(ticket.createdAt, false)}
            </time>
          </Button>
        ))}
      </div>
      {inspected && (
        <section className="mt-3" aria-label="Detalhes do chamado selecionado">
          <TicketCard ticket={inspected} />
        </section>
      )}
    </>
  )
}
