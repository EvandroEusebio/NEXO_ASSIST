"use client"
import { useEffect, useRef, useState } from "react"
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
import { ArrowLeft, ArrowUp, LogOut, MessageSquare, Search } from "lucide-react"
import type {
  AnalystConversation,
  AnalystDetail,
} from "../../../../src/contracts/analyst"
import {
  categoryLabels,
  priorityLabels,
  statusLabels,
} from "../../../../src/contracts/chat"
const labels: Record<string, string> = {
  ...priorityLabels,
  ...statusLabels,
  AGENT_ACTIVE: "Com o agent",
  WAITING_ANALYST: "Aguardando atendente",
  ANALYST_ACTIVE: "Em atendimento",
}
const eventLabels: Record<string, string> = {
  CREATED: "Chamado criado",
  UPDATED: "Chamado atualizado",
  REOPENED: "Chamado reaberto",
  TRANSFERRED: "Encaminhado ao analista",
  ASSIGNED: "Atendimento assumido",
  ANALYST_RESPONSE: "Resposta do analista",
  RETURNED_TO_AGENT: "Devolvido ao assistente",
  RESOLVED: "Chamado resolvido",
  CLOSED: "Chamado encerrado",
}
const time = (value: string) =>
  new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })
const initials = (name: string) =>
  name
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
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
  const retry = useRef<{ key: string; id: string } | null>(null)
  const [closing, setClosing] = useState(false)
  const [showTickets, setShowTickets] = useState(false)
  const [resolve, setResolve] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    async function refresh() {
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
          setDetail((previous) =>
            previous?.id === next.id && previous.revision > next.revision
              ? previous
              : next
          )
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Falha de conexão.")
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
    historyEnd.current?.scrollIntoView({ block: "end" })
  }, [detail?.id, detail?.messages.length])
  async function act(action: "claim" | "reply" | "return" | "close") {
    if (!detail || lock.current) return
    lock.current = true
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
  const owned =
    detail?.status === "ANALYST_ACTIVE" && detail.assignedAnalystId === user.id
  const waiting = detail?.status === "WAITING_ANALYST"
  const linked = detail?.tickets.find(
    (t) => t.number === detail.handoff?.number
  )
  const visible = queue.filter(
    (c) =>
      (filter === "all" ||
        (filter === "waiting" && c.status === "WAITING_ANALYST") ||
        (filter === "agent" && c.status === "AGENT_ACTIVE") ||
        (filter === "mine" &&
          c.assignedAnalystId === user.id &&
          c.status === "ANALYST_ACTIVE") ||
        (filter === "closed" && c.status === "CLOSED")) &&
      `${c.employee.name} ${c.employee.email} ${c.employee.openedTickets.map((t) => t.number).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase())
  )
  return (
    <main className="flex h-dvh bg-white text-[#1c2633]">
      <nav className="flex w-16 shrink-0 flex-col items-center gap-8 border-r py-5">
        <span className="text-2xl font-bold text-blue-600">N</span>
        <MessageSquare className="text-blue-600" />
        <div className="mt-auto flex flex-col items-center gap-4">
          <span
            title={user.name}
            className="rounded-full bg-blue-100 p-2 text-xs"
          >
            {initials(user.name)}
          </span>
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
        className={`${selected ? "hidden md:flex" : "flex"} min-w-0 flex-1 flex-col border-r md:w-72 md:flex-none xl:w-80`}
      >
        {error && !selected && (
          <p role="alert" className="bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <h1 className="px-5 pt-6 text-xl font-semibold">
          Conversas{" "}
          <span className="text-sm text-slate-400">{queue.length}</span>
        </h1>
        <div className="relative m-4">
          <Search className="absolute top-3 left-3 size-4 text-slate-400" />
          <Input
            aria-label="Buscar conversas"
            className="bg-slate-50 pl-9"
            placeholder="Buscar nome ou chamado"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1 px-4 pb-4">
          {[
            ["all", "Todas"],
            ["waiting", "Na fila"],
            ["agent", "Com o agent"],
            ["mine", "Minhas"],
            ["closed", "Encerradas"],
          ].map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={filter === key ? "secondary" : "ghost"}
              onClick={() => setFilter(key!)}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="overflow-y-auto">
          {visible.map((c) => (
            <button
              key={c.id}
              disabled={busy}
              onClick={() => {
                setSelected(c.id)
                setDetail(null)
                setReply("")
                setError("")
              }}
              className={`flex w-full gap-3 border-b p-4 text-left ${selected === c.id ? "bg-blue-50" : "hover:bg-slate-50"}`}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs">
                {initials(c.employee.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2">
                  <strong className="truncate text-sm">
                    {c.employee.name}
                  </strong>
                  <span className="text-xs text-slate-400">
                    {time(c.updatedAt)}
                  </span>
                </div>
                <p className="my-1 truncate text-xs text-slate-500">
                  {c.messages[0]?.content ?? "Nova conversa"}
                </p>
                <span
                  className={`text-xs ${c.status === "WAITING_ANALYST" ? "text-amber-700" : "text-blue-700"}`}
                >
                  {labels[c.status]}
                </span>
              </div>
            </button>
          ))}
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
            <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-5 py-4">
              <div className="flex items-center gap-2">
                <Button
                  className="md:hidden"
                  variant="ghost"
                  size="icon"
                  aria-label="Voltar à fila"
                  onClick={() => {
                    setSelected(null)
                    setDetail(null)
                  }}
                >
                  <ArrowLeft />
                </Button>
                <div>
                  <h2 className="font-semibold">{detail.employee.name}</h2>
                  <p className="text-xs text-slate-500">
                    {labels[detail.status]}
                    {detail.assignedAnalyst
                      ? ` · ${detail.assignedAnalyst.name}`
                      : ""}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                className="xl:hidden"
                onClick={() => setShowTickets(!showTickets)}
              >
                Chamados
              </Button>
              {owned && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void act("return")}
                  >
                    Devolver ao agent
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() => setClosing(true)}
                  >
                    Encerrar
                  </Button>
                </div>
              )}
            </header>
            <div
              className="flex-1 space-y-4 overflow-y-auto p-5"
              aria-label="Histórico da conversa"
            >
              <div className="rounded-xl border border-blue-100 bg-white p-4 text-sm">
                <strong>Contexto do atendimento</strong>
                <p className="mt-2 whitespace-pre-wrap text-slate-600">
                  {detail.handoff?.summary ??
                    "Conversa ainda com o assistente."}
                </p>
                {detail.drafts.map((d) => (
                  <p key={d.id} className="mt-2 text-amber-800">
                    Rascunho aguardando confirmação:{" "}
                    {String(
                      (d.payload as { title?: string }).title ?? "Chamado"
                    )}{" "}
                    ·{" "}
                    {labels[
                      String((d.payload as { priority?: string }).priority)
                    ] ?? ""}
                  </p>
                ))}
              </div>
              {detail.messages.map((m) =>
                m.author === "SYSTEM" ? (
                  <p
                    key={m.id}
                    className="py-2 text-center text-xs text-slate-500"
                  >
                    {m.content}
                  </p>
                ) : (
                  <div
                    key={m.id}
                    className={`flex ${m.author === "EMPLOYEE" ? "justify-start" : "justify-end"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-xl p-3 text-sm ${m.author === "EMPLOYEE" ? "bg-white" : m.author === "ANALYST" ? "bg-emerald-100" : "bg-[#0064ce] text-white"}`}
                    >
                      <p className="mb-1 text-xs opacity-70">
                        {m.author === "AGENT"
                          ? "Nexo Assist"
                          : (m.authorUser?.name ?? detail.employee.name)}{" "}
                        · {time(m.createdAt)}
                      </p>
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    </div>
                  </div>
                )
              )}
              <div ref={historyEnd} />
            </div>
            <footer className="border-t bg-white p-4">
              {waiting && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <p>Aguardando um atendente · Agent pausado</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void act("return")}
                    >
                      Devolver ao agent
                    </Button>
                    <Button disabled={busy} onClick={() => void act("claim")}>
                      Assumir atendimento
                    </Button>
                  </div>
                </div>
              )}
              <form
                className="flex items-end gap-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  void act("reply")
                }}
              >
                <Textarea
                  aria-label="Resposta ao funcionário"
                  placeholder={
                    owned
                      ? "Escreva sua resposta…"
                      : "Assuma o atendimento para responder"
                  }
                  value={reply}
                  maxLength={4000}
                  disabled={!owned || busy}
                  onChange={(e) => setReply(e.target.value)}
                />
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Enviar resposta"
                  disabled={!owned || busy || !reply.trim()}
                >
                  <ArrowUp />
                </Button>
              </form>
            </footer>
          </>
        )}
      </section>
      {detail && (
        <aside
          className={`${showTickets ? "fixed inset-y-0 right-0 z-20 block w-80 bg-white shadow-xl" : "hidden w-72"} shrink-0 overflow-y-auto border-l p-5 xl:static xl:block xl:w-72 xl:shadow-none`}
        >
          <Button
            className="mb-3 xl:hidden"
            variant="outline"
            onClick={() => setShowTickets(false)}
          >
            Fechar chamados
          </Button>
          <h2 className="font-semibold">
            Chamados de {detail.employee.name.split(" ")[0]}
          </h2>
          <p className="mt-1 mb-5 text-xs text-slate-500">
            {detail.tickets.length} chamados registrados
          </p>
          {[...detail.tickets]
            .sort(
              (a, b) =>
                Number(b.number === linked?.number) -
                Number(a.number === linked?.number)
            )
            .map((t) => (
              <article key={t.id} className="mb-4 rounded-xl border p-4">
                {t.number === linked?.number && (
                  <p className="mb-2 text-xs text-blue-600">
                    Associado à conversa
                  </p>
                )}
                <strong className="text-sm">{t.number}</strong>
                <p className="my-2 text-sm">{t.title}</p>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary">{labels[t.status]}</Badge>
                  <Badge variant="outline">{labels[t.priority]}</Badge>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {categoryLabels[t.category]}
                </p>
                {t.nextResponseDueAt && (
                  <p className="mt-2 text-xs">
                    Prazo:{" "}
                    {new Date(t.nextResponseDueAt).toLocaleString("pt-BR")}
                  </p>
                )}
                <details className="mt-3 text-xs">
                  <summary className="cursor-pointer text-blue-600">
                    Histórico do chamado
                  </summary>
                  {t.events.map((e) => (
                    <p key={e.id} className="mt-2 border-t pt-2">
                      {new Date(e.createdAt).toLocaleString("pt-BR")} ·{" "}
                      {eventLabels[e.action] ?? e.action}
                    </p>
                  ))}
                </details>
              </article>
            ))}
        </aside>
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
