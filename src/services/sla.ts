import type { TicketPriority, TicketStatus } from "../generated/prisma/enums"

export type BusinessCalendar = {
  timeZone: string
  startHour: number
  endHour: number
  holidays: ReadonlySet<string>
}

export function businessCalendar(env = process.env): BusinessCalendar {
  const timeZone = env.SLA_TIME_ZONE ?? "America/Sao_Paulo"
  const startHour = Number(env.SLA_WORK_START_HOUR ?? 9)
  const endHour = Number(env.SLA_WORK_END_HOUR ?? 18)
  const holidays = new Set(
    (env.SLA_HOLIDAYS ?? "")
      .split(",")
      .map((day) => day.trim())
      .filter(Boolean)
  )
  try {
    new Intl.DateTimeFormat("en-US", { timeZone })
  } catch {
    throw new Error("SLA_TIME_ZONE inválido.")
  }
  if (
    !Number.isInteger(startHour) ||
    !Number.isInteger(endHour) ||
    startHour < 0 ||
    endHour > 24 ||
    startHour >= endHour ||
    [...holidays].some((day) => !/^\d{4}-\d{2}-\d{2}$/.test(day))
  )
    throw new Error("Calendário de SLA inválido.")
  return { timeZone, startHour, endHour, holidays }
}

export function responseDueAt(
  priority: TicketPriority,
  from: Date,
  calendar = businessCalendar()
): Date {
  if (Number.isNaN(from.getTime())) throw new Error("Data de início inválida.")
  if (priority === "CRITICAL") return new Date(from.getTime() + 60 * 60_000)

  const hours =
    priority === "HIGH"
      ? 4
      : (priority === "MEDIUM" ? 3 : 5) *
        (calendar.endHour - calendar.startHour)
  let remaining = hours * 60 * 60_000
  let cursor = from.getTime()
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: calendar.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  })
  // Advance to the next UTC minute. This handles local weekends, holidays and DST
  // without assuming that every local day has 24 hours.
  while (remaining > 0) {
    const parts = Object.fromEntries(
      formatter.formatToParts(cursor).map((part) => [part.type, part.value])
    )
    const year = Number(parts.year)
    const month = Number(parts.month)
    const day = Number(parts.day)
    const hour = Number(parts.hour)
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
    const date = `${parts.year}-${parts.month}-${parts.day}`
    const nextMinute = cursor + (60_000 - (cursor % 60_000))
    const span = Math.min(nextMinute - cursor, remaining)
    const active =
      weekday !== 0 &&
      weekday !== 6 &&
      !calendar.holidays.has(date) &&
      hour >= calendar.startHour &&
      hour < calendar.endHour
    if (active) remaining -= span
    if (remaining === 0) return new Date(cursor + span)
    cursor = nextMinute
  }
  return new Date(cursor)
}

export function isOverdue(
  ticket: { status: TicketStatus; nextResponseDueAt: Date | null },
  now = new Date()
): boolean {
  return (
    !["RESOLVED", "CLOSED"].includes(ticket.status) &&
    ticket.nextResponseDueAt !== null &&
    ticket.nextResponseDueAt.getTime() < now.getTime()
  )
}
