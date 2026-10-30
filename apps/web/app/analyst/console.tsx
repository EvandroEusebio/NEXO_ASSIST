"use client"
import {
  PresenceAvatar,
  UnreadBadge,
  MessageReceipt,
  TypingIndicator,
} from "@/components/conversation-indicators"
import { useConversationActivity } from "@/hooks/use-conversation-activity"
import { wasRead } from "../../../../src/contracts/activity"
import { DecisionPanel } from "@/components/decision-panel"
import { groupAnalystQueue } from "../../../../src/contracts/analyst-queue"
import { AnalystTickets } from "./tickets-panel"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Fragment, useEffect, useRef, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { Badge } from "@workspace/ui/components/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  ArrowLeft,
  ArrowUp,
  ArrowLeftRight,
  Bot,
  Hand,
  Headphones,
  LogOut,
  MessageSquare,
  Search,
  X,
  CircleCheckBig,
  EllipsisVertical,
  SendHorizonal,
} from "lucide-react"
import type {
  AnalystConversation,
  AnalystDetail,
} from "../../../../src/contracts/analyst"
import { priorityLabels, statusLabels } from "../../../../src/contracts/chat"
const labels: Record<string, string> = {
  ...priorityLabels,
  ...statusLabels,
  AGENT_ACTIVE: "Com o agent",
  WAITING_ANALYST: "Aguardando atendente",
  ANALYST_ACTIVE: "Em atendimento",
}
const time = (value: string) =>
  new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })
export function AnalystConsole({
  user,
}: {
  user: { id: string; name: string }
}) {
  const [queue, setQueue] = useState<AnalystConversation[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<AnalystDetail | null>(null)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("all")
  const [reply, setReply] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const historyEnd = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const retry = useRef<{ key: string; id: string } | null>(null)
  const [closing, setClosing] = useState(false)
  const [showTickets, setShowTickets] = useState(false)
  const [resolve, setResolve] = useState(false)
  const [ticketsHidden, setTicketsHidden] = useState(false)
  const owned =
    detail?.status === "ANALYST_ACTIVE" && detail.assignedAnalystId === user.id
  const { connected, reportTyping, stopTyping } = useConversationActivity({
    conversationId: selected,
    latestMessageId:
      detail?.id === selected ? detail.messages.at(-1)?.id : undefined,
    canType: owned,
    readSentinel: historyEnd,
  })
  useEffect(() => {
    const controller = new AbortController()
    let refreshing = false
    async function refresh() {
      if (refreshing || document.visibilityState !== "visible") return
      refreshing = true
      try {
        const response = await fetch("/api/analyst/conversations", {
          signal: controller.signal,
          cache: "no-store",
        })
        if (response.status === 401) {
          window.location.assign("/login")
          return
        }
        if (!response.ok) throw new Error("Não foi possível atualizar a fila.")
        setQueue(await response.json())
        if (selected) {
          const result = await fetch(`/api/analyst/conversations/${selected}`, {
            signal: controller.signal,
            cache: "no-store",
          })
          if (!result.ok)
            throw new Error("Não foi possível atualizar a conversa.")
          const next = (await result.json()) as AnalystDetail
          if (controller.signal.aborted) return
          setDetail((previous) =>
            previous?.id === next.id && previous.revision > next.revision
              ? previous
              : next
          )
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Falha de conexão.")
      } finally {
        refreshing = false
      }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 3000)
    return () => {
      controller.abort()
      clearInterval(timer)
    }
  }, [selected])
  useEffect(() => {
    if (nearBottom.current) historyEnd.current?.scrollIntoView({ block: "end" })
  }, [detail?.id, detail?.messages.length])
  async function act(action: "claim" | "reply" | "return" | "close") {
    if (!detail || lock.current) return
    lock.current = true
    stopTyping()
    setBusy(true)
    setError("")
    const key = JSON.stringify([detail.id, action, reply, resolve])
    const requestId =
      retry.current?.key === key ? retry.current.id : crypto.randomUUID()
    retry.current = { key, id: requestId }
    try {
      const response = await fetch(`/api/analyst/conversations/${detail.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          requestId,
          revision: detail.revision,
          ...(action === "reply" ? { content: reply } : {}),
          ...(action === "close" ? { resolveTicket: resolve } : {}),
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        if (response.status < 500) retry.current = null
        throw new Error(result.error)
      }
      retry.current = null
      setDetail(result)
      setClosing(false)
      setResolve(false)
      if (action === "reply") setReply("")
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Falha de conexão. Tente novamente."
      )
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const waiting = detail?.status === "WAITING_ANALYST"
  const linked = detail?.tickets.find(
    (t) => t.number === detail.handoff?.number
  )
  const visible = groupAnalystQueue(queue, user.id, filter, search)
  const unreadTotal = queue.reduce(
    (total, c) => total + c.activity.unreadCount,
    0
  )
  const counts = {
    all: groupAnalystQueue(queue, user.id).length,
    waiting: groupAnalystQueue(queue, user.id, "waiting").length,
    agent: groupAnalystQueue(queue, user.id, "agent").length,
    mine: groupAnalystQueue(queue, user.id, "mine").length,
  }
  const employeeThreads = queue.filter(
    (c) => c.employee.id === detail?.employee.id
  )
  function selectThread(id: string) {
    stopTyping()
    nearBottom.current = true
    setSelected(id)
    setDetail(null)
    setReply("")
    setError("")
  }
  const filters = [
    ["all", "Todas"],
    ["waiting", "Para você"],
    ["agent", "Com o agent"],
    ["mine", "Minhas"],
  ] as const
  const statusColor = (status: string) =>
    status === "WAITING_ANALYST"
      ? "text-red-600"
      : status === "AGENT_ACTIVE"
        ? "text-emerald-700"
        : status === "CLOSED"
          ? "text-slate-400"
          : "text-amber-700"

  return (
    <main className="flex h-dvh overflow-hidden bg-white text-[#1c2633]">
      <nav className="flex w-16 shrink-0 flex-col items-center gap-5 border-r border-[#e8ebef] bg-[#f8f9fb] py-6">
        <svg
          viewBox="0 0 24 24"
          aria-label="Nexo Assist"
          className="size-6 fill-[#0075f5]"
        >
          <path d="M2 5 7 2l10 8V2l5 3v14l-5 3L7 14v8l-5-3Z" />
        </svg>
        <Button
          variant="outline"
          size="icon"
          className="relative size-10 rounded-xl bg-white"
          aria-label="Fila de conversas"
          onClick={() => {
            if (!busy) {
              stopTyping()
              setSelected(null)
              setDetail(null)
            }
          }}
        >
          <MessageSquare className="size-5" />
          {unreadTotal > 0 && (
            <span className="absolute -top-1 -right-2">
              <UnreadBadge count={unreadTotal} />
            </span>
          )}
        </Button>
        <div className="mt-auto flex flex-col items-center gap-3">
          <PresenceAvatar
            name={user.name}
            online={connected}
            className="scale-90"
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sair"
            onClick={async () => {
              const res = await fetch("/api/auth/logout", { method: "POST" })
              if (res.ok) window.location.assign("/login")
            }}
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </nav>
      <aside
        className={`${selected ? "hidden md:flex" : "flex"} min-w-0 flex-1 flex-col border-r border-[#e8ebef] md:w-80 md:flex-none xl:w-[380px]`}
      >
        {error && !selected && (
          <p role="alert" className="bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between px-4 pt-4">
          <h1 className="text-xl font-semibold">Conversas</h1>
          <Badge
            variant="secondary"
            className={
              connected
                ? "rounded-full bg-[#eafaf3] text-[#00804a]"
                : "rounded-full bg-slate-100 text-slate-500"
            }
          >
            <span
              className={`mr-1 size-1.5 rounded-full ${connected ? "bg-[#00bd78]" : "bg-slate-400"}`}
            />
            {connected ? "Disponível" : "Ausente"}
          </Badge>
        </div>
        <div className="relative mx-4 mt-3 mb-2">
          <Search className="absolute top-2.5 left-3 size-4 text-slate-500" />
          <Input
            aria-label="Buscar conversas"
            className="h-9 rounded-full border-0 bg-[#f5f6f8] pl-9 shadow-none"
            placeholder="Pesquisar conversa ou chamado"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1 px-4 pb-2">
          {filters.map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant="ghost"
              className={`rounded-full px-2 text-xs ${filter === key ? "bg-[#eaf3ff] text-[#0064ce]" : "bg-[#f6f7f9] text-slate-600"}`}
              onClick={() => setFilter(key)}
            >
              {label}
              {key !== "all" && (
                <span className="ml-1 font-semibold">{counts[key]}</span>
              )}
            </Button>
          ))}
        </div>
        <div className="min-h-0 overflow-y-auto px-2">
          {visible.map((c) => {
            const latest = c.messages[0]
            return (
              <Button
                key={c.employee.id}
                variant="ghost"
                disabled={busy}
                aria-pressed={c.threads.some((t) => t.id === selected)}
                data-conversation-id={c.id}
                data-employee-id={c.employee.id}
                onClick={() => selectThread(c.id)}
                className={`h-auto w-full justify-start gap-3 rounded-xl px-2.5 py-3 text-left font-normal whitespace-normal ${c.threads.some((t) => t.id === selected) ? "bg-[#f4f6f8]" : "hover:bg-[#f7f8fa]"}`}
              >
                <PresenceAvatar
                  name={c.employee.name}
                  online={c.activity.employee.online}
                />
                <div className="min-w-0 flex-1 border-b border-[#edf0f4] pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="truncate text-sm">
                      {c.employee.name}
                    </strong>
                    <span
                      className={`shrink-0 text-[11px] ${c.activity.unreadCount ? "font-semibold text-[#0064ce]" : "text-slate-500"}`}
                    >
                      {c.activity.employee.typing
                        ? "agora"
                        : time(latest?.createdAt ?? c.updatedAt)}
                    </span>
                  </div>
                  <div className="my-1 flex min-h-4 items-center gap-1.5">
                    {c.activity.employee.typing ? (
                      <TypingIndicator />
                    ) : (
                      <>
                        <span className="shrink-0">
                          {latest &&
                            ["AGENT", "ANALYST"].includes(latest.author) && (
                              <MessageReceipt
                                read={wasRead(latest, c.activity.employeeRead)}
                              />
                            )}
                        </span>
                        <p className="min-w-0 flex-1 truncate text-xs text-slate-500">
                          {latest?.author === "AGENT" ? "Nexo: " : ""}
                          {latest?.content ?? "Nova conversa"}
                        </p>
                      </>
                    )}
                    <span className="ml-auto">
                      <UnreadBadge count={c.activity.unreadCount} />
                    </span>
                  </div>
                  <p
                    className={`flex items-center gap-1 text-[11px] ${statusColor(c.status)}`}
                  >
                    <span className="size-1.5 rounded-full bg-current" />
                    {c.status === "WAITING_ANALYST"
                      ? "Transferida"
                      : c.status === "AGENT_ACTIVE"
                        ? "Agent atendendo"
                        : labels[c.status]}
                  </p>
                </div>
              </Button>
            )
          })}
          {!visible.length && (
            <p className="p-5 text-sm text-slate-500">
              Nenhuma conversa neste filtro.
            </p>
          )}
        </div>
      </aside>
      <section
        className={`${selected ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col bg-[#edf0f4]`}
      >
        {error && (
          <p role="alert" className="bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {!detail ? (
          <div className="m-auto p-8 text-slate-500">
            {selected
              ? "Carregando conversa…"
              : "Selecione uma conversa para atender."}
          </div>
        ) : (
          <>
            <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#e8ebef] bg-white px-5 py-2">
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  className="md:hidden"
                  variant="ghost"
                  size="icon"
                  aria-label="Voltar à fila"
                  onClick={() => {
                    stopTyping()
                    setSelected(null)
                    setDetail(null)
                  }}
                >
                  <ArrowLeft />
                </Button>
                <PresenceAvatar
                  name={detail.employee.name}
                  online={detail.activity.employee.online}
                />
                <div>
                  <h2 className="text-sm font-semibold">
                    {detail.employee.name}
                  </h2>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {detail.activity.employee.typing ? (
                      <TypingIndicator />
                    ) : (
                      <>
                        {detail.activity.employee.online ? "online" : "offline"}
                        {linked ? ` · ${linked.number}` : ""}
                      </>
                    )}
                  </div>
                </div>
              </div>
              {owned && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void act("return")}
                  >
                    <Bot />
                    Devolver ao agent
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() => setClosing(true)}
                  >
                    <CircleCheckBig size={20} />
                    Encerrar atendimento
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    //onClick={() => setShowTickets(true)}
                  >
                    <EllipsisVertical size={20} />
                  </Button>
                </div>
              )}
            </header>
            <div
              className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 xl:px-10"
              aria-label="Histórico da conversa"
              onScroll={(e) => {
                const el = e.currentTarget
                nearBottom.current =
                  el.scrollHeight - el.scrollTop - el.clientHeight < 100
              }}
            >
              {detail.handoff && (
                <details className="rounded-lg border border-slate-200 bg-white/70 p-3 text-xs text-slate-600">
                  <summary className="cursor-pointer font-medium">
                    Contexto do atendimento
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap">
                    {detail.handoff.summary}
                  </p>
                  {detail.drafts.map((d) => (
                    <p key={d.id} className="mt-2 text-amber-800">
                      Rascunho pendente:{" "}
                      {String(
                        (d.payload as { title?: string }).title ?? "Chamado"
                      )}
                    </p>
                  ))}
                </details>
              )}
              {detail.messages.map((m, index) => (
                <Fragment key={m.id}>
                  {(index === 0 ||
                    new Date(
                      detail.messages[index - 1]!.createdAt
                    ).toDateString() !==
                      new Date(m.createdAt).toDateString()) && (
                    <div className="flex justify-center py-2">
                      <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] text-slate-500">
                        {new Date(m.createdAt).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                  )}
                  {m.author === "SYSTEM" ? (
                    <div className="py-2 text-center text-xs text-slate-500">
                      <p className="flex items-center justify-center gap-2">
                        <ArrowLeftRight className="size-3 shrink-0" />
                        {m.content}
                      </p>
                      <DecisionPanel decision={m.decision} />
                    </div>
                  ) : (
                    <div
                      className={`flex ${m.author === "EMPLOYEE" ? "justify-start" : "justify-end"}`}
                    >
                      <div className="max-w-[90%] md:max-w-[85%]">
                        {m.author !== "EMPLOYEE" && (
                          <p className="mb-1 text-right text-[11px] text-slate-600">
                            {m.author === "AGENT"
                              ? "Nexo Assist"
                              : (m.authorUser?.name ?? "Analista")}
                            {m.author === "AGENT" && (
                              <span className="ml-2 rounded bg-[#dceafa] px-1 text-[10px] font-semibold text-[#0064ce]">
                                IA
                              </span>
                            )}
                          </p>
                        )}
                        <div
                          className={`rounded-xl px-3 py-2 text-sm shadow-[0_1px_2px_#1c263308] ${m.author === "EMPLOYEE" ? "rounded-tl-sm bg-white" : m.author === "ANALYST" ? "rounded-tr-sm bg-[#e1f3e9]" : "rounded-tr-sm bg-[#e5effb]"}`}
                        >
                          <p className="[overflow-wrap:anywhere] whitespace-pre-wrap">
                            {m.content}
                          </p>
                          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-500">
                            <time>{time(m.createdAt)}</time>
                            {["AGENT", "ANALYST"].includes(m.author) && (
                              <MessageReceipt
                                read={wasRead(m, detail.activity.employeeRead)}
                              />
                            )}
                          </div>
                        </div>
                        <DecisionPanel
                          decision={m.decision}
                          unavailable={m.author === "AGENT"}
                        />
                      </div>
                    </div>
                  )}
                </Fragment>
              ))}
              {detail.activity.employee.typing && (
                <div className="w-fit rounded-xl bg-white px-3 py-2">
                  <TypingIndicator name={detail.employee.name.split(" ")[0]} />
                </div>
              )}
              <div ref={historyEnd} className="h-px" />
            </div>
            <footer className="shrink-0 border-t border-[#e8ebef] bg-white p-4">
              {waiting && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-[#fff7e8] p-2 text-amber-700">
                      <Hand className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">
                        {detail.employee.name.split(" ")[0]} espera um atendente
                      </p>
                      <p className="text-xs text-slate-500">Agent pausado</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void act("return")}
                    >
                      <Bot />
                      Devolver ao agent
                    </Button>
                    <Button disabled={busy} onClick={() => void act("claim")}>
                      <Headphones />
                      Assumir atendimento
                    </Button>
                  </div>
                </div>
              )}
              <form
                className="flex items-end gap-3 "
                onSubmit={(e) => {
                  e.preventDefault()
                  void act("reply")
                }}
              >
                <Textarea
                  aria-label="Resposta ao funcionário"
                  rows={1}
                  className="[field-sizing-content] max-h-40 min-h-12 resize-none overflow-y-auto border-0 bg-[#f7f8fa] px-3 py-3 leading-6 shadow-none"
                  placeholder={
                    owned
                      ? "Escreva sua resposta…"
                      : "Assuma o atendimento para responder"
                  }
                  value={reply}
                  maxLength={4000}
                  disabled={!owned || busy}
                  onChange={(e) => {
                    setReply(e.target.value)
                    reportTyping(!!e.target.value.trim())
                  }}
                  onBlur={stopTyping}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="rounded-full"
                  aria-label="Enviar resposta"
                  disabled={!owned || busy || !reply.trim()}
                >
                  <SendHorizonal  />
                </Button>
              </form>
            </footer>
          </>
        )}
      </section>
      {detail && !ticketsHidden && (
        <AnalystTickets
          key={detail.employee.id}
          detail={detail}
          showTickets={showTickets}
          onClose={() => {
            setShowTickets(false)
            setTicketsHidden(true)
          }}
        />
      )}
      <Dialog open={closing} onOpenChange={setClosing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Encerrar atendimento?</DialogTitle>
            <DialogDescription>
              A conversa será encerrada e os rascunhos pendentes serão
              expirados.
            </DialogDescription>
          </DialogHeader>
          {linked && !["RESOLVED", "CLOSED"].includes(linked.status) && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={resolve}
                onCheckedChange={(v) => setResolve(v === true)}
              />
              Resolver também o chamado {linked.number}
            </label>
          )}
          <Button disabled={busy} onClick={() => void act("close")}>
            Confirmar encerramento
          </Button>
        </DialogContent>
      </Dialog>
    </main>
  )
}
