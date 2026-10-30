import type { AnalystConversation } from "./analyst"

export function matchesQueueFilter(
  c: AnalystConversation,
  filter: string,
  analystId: string
) {
  return (
    filter === "all" ||
    (filter === "waiting" && c.status === "WAITING_ANALYST") ||
    (filter === "agent" && c.status === "AGENT_ACTIVE") ||
    (filter === "mine" &&
      c.status === "ANALYST_ACTIVE" &&
      c.assignedAnalystId === analystId) ||
    (filter === "closed" && c.status === "CLOSED")
  )
}

/** One contact per employee. Filtering happens before choosing the thread to open. */
export function groupAnalystQueue(
  queue: AnalystConversation[],
  analystId: string,
  filter = "all",
  search = "",
  selectedId?: string | null
) {
  const groups = new Map<string, AnalystConversation[]>()
  for (const c of queue)
    groups.set(c.employee.id, [...(groups.get(c.employee.id) ?? []), c])
  return [...groups.values()]
    .flatMap((threads) => {
      threads.sort(
        (a, b) =>
          b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id)
      )
      const matching = threads.filter((c) =>
        matchesQueueFilter(c, filter, analystId)
      )
      if (!matching.length) return []
      const c = matching[0]!
      if (
        !`${c.employee.name} ${c.employee.email} ${c.employee.openedTickets.map((t) => t.number).join(" ")}`
          .toLowerCase()
          .includes(search.trim().toLowerCase())
      )
        return []
      // Prefer an actionable thread; never silently switch an already opened thread.
      const selected = matching.find((t) => t.id === selectedId)
      const current =
        selected ??
        (filter === "all"
          ? (matching.find(
              (t) =>
                t.status === "ANALYST_ACTIVE" &&
                t.assignedAnalystId === analystId
            ) ??
            matching.find((t) => t.status === "WAITING_ANALYST") ??
            c)
          : c)
      return [
        {
          ...current,
          threads,
          updatedAt: current.updatedAt,
          activity: {
            ...current.activity,
            unreadCount:
              current.status === "ANALYST_ACTIVE" &&
              current.assignedAnalystId === analystId
                ? current.activity.unreadCount
                : 0,
            employee: {
              online: threads.some((t) => t.activity.employee.online),
              typing: current.activity.employee.typing,
            },
          },
        },
      ]
    })
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) ||
        a.employee.id.localeCompare(b.employee.id)
    )
}
