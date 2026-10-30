"use client"

import { useConversationActivity } from "@/hooks/use-conversation-activity"
import {
  MessageReceipt,
  TypingIndicator,
  UnreadBadge,
} from "@/components/conversation-indicators"
import { wasRead } from "../../../../src/contracts/activity"

import { DecisionPanel } from "@/components/decision-panel"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { EmployeeSidebar } from "@/components/employee-sidebar"
import { ArrowUp, Check, ChevronRight, Plus } from "lucide-react"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  categoryLabels,
  priorityLabels,
  statusLabels,
  MESSAGE_LIMIT,
  type ChatAction,
  type ChatDraft,
  type ChatSnapshot,
  type ConversationSummary,
  type DraftFields,
} from "../../../../src/contracts/chat"
import { styles } from "./styles"
import {
  TicketCard,
  TicketChoices,
  ticketAge,
  ticketOverdue,
} from "./ticket-components"

type User = { name: string; email: string }
const typeOptions = [
  { value: "INC", label: "Incidente · algo deixou de funcionar" },
  { value: "REQ", label: "Requisição · novo pedido" },
]
const categoryOptions = Object.entries(categoryLabels).map(
  ([value, label]) => ({ value, label })
)
const impactOptions = [
  { value: "TEAM_STOPPED", label: "Equipa ou empresa parada" },
  { value: "PERSON_BLOCKED", label: "Uma pessoa impedida de trabalhar" },
  {
    value: "WORKAROUND_AVAILABLE",
    label: "Problema com alternativa temporária",
  },
  { value: "ROUTINE_REQUEST", label: "Pedido ou melhoria sem bloqueio" },
]
const urgencyOptions = [
  { value: "SAME_DAY", label: "Precisa de solução hoje" },
  { value: "ROUTINE", label: "Sem prazo para hoje" },
]
type PendingRequest = {
  content: string
  action?: ChatAction
  requestId: string
}
const date = (value: string) =>
  new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Luanda",
  }).format(new Date(value))

export function Chat({
  user,
  initial,
  initialHistory,
}: {
  user: User
  initial: ChatSnapshot | null
  initialHistory: ConversationSummary[]
}) {
  const [snapshot, setSnapshot] = useState(initial)
  const [history, setHistory] = useState(initialHistory)
  const [content, setContent] = useState("")
  const composerInput = useRef<HTMLInputElement>(null)
  const [dismissedTicketActions, setDismissedTicketActions] = useState<
    string[]
  >([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [reconnecting, setReconnecting] = useState(false)
  const [retry, setRetry] = useState<PendingRequest | null>(null)
  const [editor, setEditor] = useState<{ draft?: ChatDraft } | null>(null)
  const currentId = useRef(initial?.id ?? null)
  const pending = useRef(false)
  const bottom = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const count = snapshot?.messageCount ?? 0
  const limited = count >= MESSAGE_LIMIT
  const human = snapshot && snapshot.status !== "AGENT_ACTIVE"
  const analystActive = snapshot?.status === "ANALYST_ACTIVE"
  const analystOnline = analystActive && snapshot.activity.analyst.online
  const disabled = busy || limited || snapshot?.status === "CLOSED"
  const incoming = history.find(
    (c) =>
      c.id !== snapshot?.id &&
      c.status === "ANALYST_ACTIVE" &&
      c.unreadCount > 0
  )
  const conversationId = snapshot?.id
  const { reportTyping, stopTyping } = useConversationActivity({
    conversationId,
    latestMessageId: snapshot?.messages.at(-1)?.id,
    canType: !disabled,
    readSentinel: bottom,
  })

  async function api<T>(url: string, body?: unknown): Promise<T> {
    const response = await fetch(
      url,
      body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : { cache: "no-store" }
    )
    if (response.status === 401) {
      window.location.assign("/login")
      throw new Error("Sessão expirada.")
    }
    const data = await response.json()
    if (!response.ok)
      throw new Error(data.error ?? "Não foi possível concluir o pedido.")
    return data as T
  }
  function accept(data: ChatSnapshot) {
    if (currentId.current === data.id)
      setSnapshot((previous) =>
        previous?.id === data.id && previous.revision > data.revision
          ? previous
          : data
      )
  }
  useEffect(() => {
    const controller = new AbortController()
    let refreshing = false
    const refresh = async () => {
      if (refreshing || document.visibilityState !== "visible") return
      refreshing = true
      try {
        const response = await fetch("/api/conversations", {
          signal: controller.signal,
          cache: "no-store",
        })
        if (response.ok && !controller.signal.aborted)
          setHistory((await response.json()).conversations)
      } catch {
        /* The SSE connection displays connectivity problems. */
      } finally {
        refreshing = false
      }
    }
    const timer = setInterval(() => void refresh(), 3000)
    return () => {
      controller.abort()
      clearInterval(timer)
    }
  }, [])
  useEffect(() => {
    if (!conversationId) return
    const source = new EventSource(
      `/api/conversations/${conversationId}/events`
    )
    source.onmessage = (event) => {
      accept(JSON.parse(event.data) as ChatSnapshot)
      setReconnecting(false)
    }
    source.onerror = () => setReconnecting(true)
    source.addEventListener("session-expired", () => {
      source.close()
      window.location.assign("/login")
    })
    return () => source.close()
  }, [conversationId])
  useEffect(() => {
    if (nearBottom.current) bottom.current?.scrollIntoView({ block: "end" })
  }, [snapshot?.messages.length, editor])

  async function create() {
    const id = crypto.randomUUID()
    const data = await api<ChatSnapshot>("/api/conversations", { id })
    currentId.current = id
    setSnapshot(data)
    return id
  }
  async function refreshHistory() {
    const result = await api<{ conversations: ConversationSummary[] }>(
      "/api/conversations"
    )
    setHistory(result.conversations)
  }
  async function newConversation() {
    if (pending.current) return
    stopTyping()
    nearBottom.current = true
    pending.current = true
    setBusy(true)
    setError("")
    try {
      await create()
      setEditor(null)
      setRetry(null)
      setContent("")
      await refreshHistory()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao iniciar conversa.")
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  async function selectConversation(id: string) {
    if (!id || pending.current) return
    stopTyping()
    nearBottom.current = true
    pending.current = true
    setBusy(true)
    setError("")
    try {
      const data = await api<ChatSnapshot>(`/api/conversations/${id}`)
      currentId.current = id
      setSnapshot(data)
      setEditor(null)
      setRetry(null)
      setContent("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar conversa.")
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  async function send(
    text: string,
    action?: ChatAction,
    requestId = crypto.randomUUID()
  ) {
    if (pending.current || disabled) return
    stopTyping()
    const payload = { content: text, action, requestId }
    pending.current = true
    setBusy(true)
    setError("")
    try {
      const id = currentId.current ?? (await create())
      const data = await api<ChatSnapshot>(
        `/api/conversations/${id}/messages`,
        payload
      )
      accept(data)
      setContent("")
      setEditor(null)
      setRetry(null)
      await refreshHistory()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no envio.")
      setRetry(payload)
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  function quickOptions() {
    return (
      <div className={styles.options}>
        <Button
          className={styles.optionButton}
          variant="outline"
          disabled={disabled || !!human}
          onClick={() =>
            void send("Quero consultar os meus chamados.", { type: "tickets" })
          }
        >
          Meus chamados
        </Button>
        <Button
          className={styles.optionButton}
          variant="outline"
          disabled={disabled || !!human || count >= MESSAGE_LIMIT - 1}
          onClick={() => setEditor({})}
        >
          Novo chamado
        </Button>
        <Button
          className={styles.optionButton}
          variant="outline"
          disabled={disabled || !!human}
          onClick={() =>
            void send("Quero consultar a central de ajuda.", { type: "help" })
          }
        >
          Central de ajuda
        </Button>
        <Button
          className={styles.optionButton}
          variant="outline"
          disabled={disabled || !!human}
          onClick={() =>
            void send("Quero falar com um analista.", { type: "handoff" })
          }
        >
          Falar com um analista
        </Button>
      </div>
    )
  }
  function renderDraft(draft: ChatDraft) {
    const fields = draft.payload
    return (
      <Card className={styles.card}>
        <div className={styles.cardHeading}>
          <span>
            {draft.operation === "CREATE"
              ? "Novo chamado"
              : `${draft.operation === "REOPEN" ? "Reabrir" : "Atualizar"} ${draft.targetTicket?.number}`}{" "}
            · Rascunho {draft.id.slice(0, 8)}
          </span>
          <Badge
            variant="secondary"
            className={`border-0 bg-transparent p-0 font-normal ${draft.status === "PENDING" ? styles.warning : "text-muted-foreground"}`}
          >
            {draft.status === "PENDING"
              ? "● Aguardando confirmação"
              : ({
                  CONFIRMED: "Confirmado",
                  CANCELLED: "Cancelado",
                  EXPIRED: "Substituído",
                }[draft.status] ?? draft.status)}
          </Badge>
        </div>
        <h3 className={styles.cardTitle}>{fields.title}</h3>
        <p className={styles.cardDescription}>{fields.description}</p>
        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt className={styles.factLabel}>Tipo / categoria</dt>
            <dd className={styles.factValue}>
              {fields.type} · {categoryLabels[fields.category]}
            </dd>
          </div>
          <div className={styles.fact}>
            <dt className={styles.factLabel}>Prioridade</dt>
            <dd className={styles.factValue}>
              {priorityLabels[fields.priority]}
            </dd>
          </div>
          <div className={styles.fact}>
            <dt className={styles.factLabel}>Afetados</dt>
            <dd className={styles.factValue}>
              {draft.operation !== "CREATE"
                ? "Mantidos do chamado"
                : "Somente você"}
            </dd>
          </div>
        </dl>
        {draft.status === "PENDING" && (
          <div className={styles.cardActions}>
            <Button
              variant="outline"
              className={styles.primary}
              disabled={disabled || !!human}
              onClick={() =>
                void send(
                  draft.operation === "CREATE"
                    ? "Confirmo a criação deste chamado."
                    : draft.operation === "REOPEN"
                      ? "Confirmo a reabertura deste chamado."
                      : "Confirmo a atualização deste chamado.",
                  {
                    type: "confirm",
                    draftId: draft.id,
                    version: draft.version,
                  }
                )
              }
            >
              Confirmar
            </Button>
            <Button
              variant="outline"
              className={styles.optionButton}
              disabled={disabled || !!human}
              onClick={() => setEditor({ draft })}
            >
              Editar
            </Button>
            <Button
              variant="outline"
              className={styles.optionButton}
              disabled={disabled || !!human}
              onClick={() =>
                void send("Cancelar este rascunho.", {
                  type: "cancel",
                  draftId: draft.id,
                  version: draft.version,
                })
              }
            >
              Cancelar
            </Button>
          </div>
        )}
      </Card>
    )
  }
  return (
    <main className={styles.screen}>
      <EmployeeSidebar user={user} active="chat" />
      <section className={styles.workspace}>
        <header className={styles.header}>
          <span className={styles.breadcrumb}>
            Service desk de TI <ChevronRight size={15} />
            <strong className={styles.headerTitle}>Atendimento</strong>
          </span>
          <Badge
            variant="secondary"
            className={
              snapshot?.status === "CLOSED" || (analystActive && !analystOnline)
                ? styles.offline
                : snapshot?.status === "WAITING_ANALYST"
                  ? styles.waitingBadge
                  : styles.online
            }
          >
            {snapshot?.status === "CLOSED"
              ? "● Atendimento encerrado"
              : snapshot?.status === "ANALYST_ACTIVE"
                ? analystOnline
                  ? "● Analista online"
                  : "● Analista offline"
                : human
                  ? "● Aguardando atendimento"
                  : "● Assistente online"}
          </Badge>
        </header>
        <details className="mx-auto w-[calc(100%_-_48px)] max-w-[808px] pt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer py-1">
            Conversas e histórico
          </summary>
          <div className={styles.history}>
            <Button
              className={styles.historyButton}
              variant="outline"
              disabled={busy}
              onClick={() => void newConversation()}
            >
              <Plus size={16} />
              Nova conversa
            </Button>
            <Label className={styles.historyLabel} htmlFor="conversation">
              Histórico
            </Label>
            <Select
              items={history.map((c) => ({
                value: c.id,
                label: `${c.title}${c.unreadCount ? ` · ${c.unreadCount} não lidas` : ""}`,
              }))}
              value={snapshot?.id ?? null}
              disabled={busy}
              onValueChange={(value) => {
                if (value) void selectConversation(value)
              }}
            >
              <SelectTrigger
                className={styles.historySelect}
                id="conversation"
                aria-label="Histórico de conversas"
              >
                <SelectValue placeholder="Selecione uma conversa" />
              </SelectTrigger>
              <SelectContent>
                {history.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span>{c.title}</span>
                    <UnreadBadge count={c.unreadCount} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </details>
        <div
          className={styles.scroll}
          onScroll={(e) => {
            const el = e.currentTarget
            nearBottom.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 100
          }}
        >
          <div
            className={styles.messages}
            role="log"
            aria-label="Mensagens da conversa"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {!snapshot && (
              <div className={styles.welcome}>
                <h1 className={styles.welcomeTitle}>Como posso ajudar?</h1>
                <p className={styles.welcomeDescription}>
                  Consulte seus chamados, prepare um novo pedido ou encontre
                  orientações na central de ajuda.
                </p>
                {quickOptions()}
              </div>
            )}
            {snapshot?.messages.map((message, index) => {
              const meta = message.metadata
              const ticket = meta?.number
                ? snapshot.tickets.find((t) => t.number === meta.number)
                : undefined
              const draft = meta?.draftId
                ? snapshot.drafts.find((d) => d.id === meta.draftId)
                : undefined
              const ticketDetail = ticket && meta?.kind === "ticket"
              const followingMessages = snapshot.messages.slice(index + 1)
              const nextList = followingMessages.findIndex(
                (m) => m.metadata?.kind === "tickets"
              )
              const nextTicketMessage = (
                nextList < 0
                  ? followingMessages
                  : followingMessages.slice(0, nextList)
              )
                .reverse()
                .find((m) => m.metadata?.kind === "ticket")
              const selectedNumber =
                nextTicketMessage?.metadata?.kind === "ticket"
                  ? nextTicketMessage.metadata.number
                  : undefined
              const latestDraft =
                draft &&
                !snapshot.messages
                  .slice(index + 1)
                  .some((m) => m.metadata?.draftId === draft.id)
              return (
                <div
                  key={message.id}
                  className={
                    message.author === "EMPLOYEE"
                      ? styles.employeeMessage
                      : styles.assistantMessage
                  }
                >
                  {message.author !== "EMPLOYEE" && (
                    <div className={styles.messageLabel}>
                      <strong className={styles.messageAuthor}>
                        {message.author === "ANALYST"
                          ? "Analista"
                          : "Nexo Assist"}
                      </strong>
                      {message.author === "ANALYST" &&
                        analystActive &&
                        message.authorUserId === snapshot.assignedAnalystId && (
                          <span
                            aria-label={
                              analystOnline
                                ? "Analista online"
                                : "Analista offline"
                            }
                            className={`inline-flex items-center gap-1.5 text-[11px] ${analystOnline ? "text-[#00804a]" : "text-muted-foreground"}`}
                          >
                            <span
                              aria-hidden="true"
                              className={`size-1.5 rounded-full ${analystOnline ? "bg-[#00bd78]" : "bg-slate-400"}`}
                            />
                            {analystOnline ? "online" : "offline"}
                          </span>
                        )}
                      {(meta?.activity || message.decision?.action) && (
                        <span className={styles.messageActivity}>
                          <Check size={12} />
                          {meta?.activity ?? message.decision?.action}
                        </span>
                      )}
                    </div>
                  )}
                  {!ticketDetail && (
                    <div
                      className={`${styles.bubble} ${message.author === "EMPLOYEE" ? styles.employeeBubble : ""}`}
                    >
                      {message.content}
                      {message.author === "EMPLOYEE" && (
                        <div className="ml-2 inline-flex items-center gap-1 align-middle text-[10px] leading-none text-slate-300">
                          <time className="sr-only">
                            {new Date(message.createdAt).toLocaleTimeString(
                              "pt-BR",
                              { hour: "2-digit", minute: "2-digit" }
                            )}
                          </time>
                          <MessageReceipt
                            read={wasRead(
                              message,
                              snapshot.activity.analystRead
                            )}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {meta?.kind === "welcome" && !human && quickOptions()}
                  {meta?.kind === "tickets" && (
                    <TicketChoices
                      tickets={snapshot.tickets.filter(
                        (t) =>
                          !meta.candidateNumbers ||
                          meta.candidateNumbers.includes(t.number)
                      )}
                      selected={selectedNumber}
                      disabled={busy && !human && !limited}
                      readOnly={!!human || limited}
                      onSelect={(t) =>
                        void send(`${t.number} · ${t.title}`, {
                          type: "ticket",
                          number: t.number,
                        })
                      }
                    />
                  )}
                  {ticket && (
                    <>
                      <TicketCard ticket={ticket} />
                      {ticket.status === "RESOLVED" &&
                        ticket.resolvedAt &&
                        Date.now() - new Date(ticket.resolvedAt).getTime() <=
                          7 * 24 * 60 * 60 * 1000 && (
                          <p className={styles.notice}>
                            Se o problema voltou, descreva-o na conversa e peça
                            para reabrir {ticket.number}.
                          </p>
                        )}
                      {ticketDetail &&
                        !dismissedTicketActions.includes(message.id) && (
                          <div className={`${styles.bubble} mt-1.5`}>
                            <p>
                              {message.content ===
                              `Consulte os detalhes do chamado ${ticket.number}.`
                                ? human
                                  ? "O chamado está com atendimento humano. Pode acrescentar informações pela conversa."
                                  : ticketOverdue(ticket)
                                    ? `A última atualização foi ${ticketAge(ticket.updatedAt)} e o prazo de resposta está vencido. Quer que eu chame um analista?`
                                    : "Confira o resumo do seu chamado. Quer falar com um analista ou adicionar informação?"
                                : message.content}
                            </p>
                            {!human && (
                              <div className={styles.options}>
                                <Button
                                  variant="outline"
                                  className={styles.optionButton}
                                  disabled={disabled}
                                  onClick={() =>
                                    void send(
                                      `Quero falar com um analista sobre ${ticket.number}.`,
                                      { type: "handoff", number: ticket.number }
                                    )
                                  }
                                >
                                  Falar com um analista
                                </Button>
                                <Button
                                  variant="outline"
                                  className={styles.optionButton}
                                  disabled={disabled}
                                  onClick={() => {
                                    setContent(
                                      `Quero adicionar uma informação ao chamado ${ticket.number}: `
                                    )
                                    composerInput.current?.focus()
                                  }}
                                >
                                  Adicionar informação
                                </Button>
                                <Button
                                  variant="outline"
                                  className={styles.optionButton}
                                  disabled={disabled}
                                  onClick={() =>
                                    setDismissedTicketActions((previous) => [
                                      ...previous,
                                      message.id,
                                    ])
                                  }
                                >
                                  Não, obrigado
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                    </>
                  )}
                  <DecisionPanel
                    decision={message.decision}
                    unavailable={message.author === "AGENT"}
                  />
                  {latestDraft && renderDraft(draft)}
                </div>
              )
            })}
            {human && (
              <p className={styles.notice}>
                {snapshot?.status === "CLOSED"
                  ? "Atendimento encerrado. Inicie uma nova conversa se precisar de ajuda."
                  : "A conversa está com o atendimento humano. As respostas automáticas estão pausadas."}
              </p>
            )}
            {editor && (
              <DraftEditor
                key={editor.draft?.id ?? "new"}
                draft={editor.draft}
                busy={busy}
                onClose={() => setEditor(null)}
                onSave={(fields) =>
                  void send(
                    editor.draft
                      ? "Atualizei os dados do rascunho."
                      : "Prepare um rascunho com estes dados.",
                    {
                      type: "draft",
                      fields,
                      draftId: editor.draft?.id,
                      version: editor.draft?.version,
                    }
                  )
                }
              />
            )}
            {busy && (
              <p className={styles.pending} role="status">
                A processar…
              </p>
            )}
            {snapshot?.activity.analyst.typing && (
              <div className="py-2">
                <TypingIndicator name="Analista" />
              </div>
            )}
            <div ref={bottom} className="h-px" />
          </div>
        </div>
        <div className={styles.composerArea}>
          {incoming && (
            <div
              className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[13px]"
              role="status"
            >
              <span>Um analista iniciou um atendimento consigo.</span>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void selectConversation(incoming.id)}
              >
                Abrir atendimento
              </Button>
            </div>
          )}
          {snapshot?.status === "CLOSED" && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted-foreground">
              <span>Este atendimento foi encerrado.</span>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void newConversation()}
              >
                Iniciar nova conversa
              </Button>
            </div>
          )}
          {reconnecting && (
            <p className={styles.notice} role="status">
              A restabelecer as atualizações da conversa…
            </p>
          )}
          {error && (
            <Alert variant="destructive" className={styles.error}>
              <AlertDescription>
                {error}
                {retry && (
                  <Button
                    variant="link"
                    className={styles.errorButton}
                    disabled={busy}
                    onClick={() =>
                      void send(retry.content, retry.action, retry.requestId)
                    }
                  >
                    Tentar novamente
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
          {limited && (
            <p className={styles.notice}>
              Atingiu 30 mensagens.{" "}
              <Button
                variant="link"
                className={styles.noticeButton}
                onClick={() => void newConversation()}
                disabled={busy}
              >
                Iniciar nova conversa
              </Button>
            </p>
          )}
          {count === MESSAGE_LIMIT - 1 && (
            <p className={styles.notice}>
              Resta uma mensagem. Se houver um rascunho pendente, confirme ou
              cancele antes de iniciar uma nova conversa.
            </p>
          )}
          <form
            className={styles.composer}
            onSubmit={(e) => {
              e.preventDefault()
              if (content.trim()) void send(content.trim())
            }}
          >
            <Input
              ref={composerInput}
              className={styles.composerInput}
              aria-label="Mensagem para o Nexo"
              placeholder="Escreva para o Nexo…"
              value={content}
              maxLength={4000}
              disabled={disabled}
              onChange={(e) => {
                setContent(e.target.value)
                reportTyping(!!e.target.value.trim())
              }}
              onBlur={stopTyping}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault()
                  if (content.trim()) void send(content.trim())
                }
              }}
            />
            <Button
              variant="outline"
              className={styles.primary}
              disabled={disabled || !content.trim()}
              type="submit"
            >
              <ArrowUp size={16} />
              Enviar
            </Button>
          </form>
          <div className={styles.counter}>
            {count}/{MESSAGE_LIMIT} mensagens nesta sessão
          </div>
        </div>
      </section>
    </main>
  )
}

function DraftEditor({
  draft,
  busy,
  onClose,
  onSave,
}: {
  draft?: ChatDraft
  busy: boolean
  onClose: () => void
  onSave: (fields: DraftFields) => void
}) {
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    onSave({
      title: String(data.get("title")),
      description: String(data.get("description")),
      type:
        draft && draft.operation !== "CREATE"
          ? draft.payload.type
          : (data.get("type") as "INC" | "REQ"),
      category: String(data.get("category")),
      priority: draft?.payload.priority ?? "MEDIUM",
      ...(draft?.operation === "UPDATE"
        ? {}
        : {
            impact: String(data.get("impact")) as DraftFields["impact"],
            urgency: String(data.get("urgency")) as DraftFields["urgency"],
          }),
    })
  }
  return (
    <Card className={styles.card}>
      <form className={styles.editor} onSubmit={submit}>
        <h3 className={styles.cardTitle}>
          {draft ? "Editar rascunho" : "Novo chamado"}
        </h3>
        <p className={styles.cardDescription}>
          Preencha os dados. A operação será aplicada depois da sua confirmação.
        </p>
        <div className={styles.editorField}>
          <Label htmlFor="draft-title">Título</Label>
          <Input
            className={styles.editorControl}
            id="draft-title"
            name="title"
            required
            maxLength={240}
            defaultValue={draft?.payload.title}
          />
        </div>
        <div className={styles.editorField}>
          <Label htmlFor="draft-description">Descrição</Label>
          <Textarea
            className={styles.editorControl}
            id="draft-description"
            name="description"
            required
            maxLength={4000}
            rows={3}
            defaultValue={draft?.payload.description}
          />
        </div>
        <div className={styles.editorGrid}>
          <div className={styles.editorField}>
            <Label htmlFor="draft-type">Tipo</Label>
            <Select
              items={typeOptions}
              name="type"
              disabled={!!draft && draft.operation !== "CREATE"}
              defaultValue={draft?.payload.type ?? "INC"}
            >
              <SelectTrigger className={styles.editorControl} id="draft-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={styles.editorField}>
            <Label htmlFor="draft-category">Categoria</Label>
            <Select
              items={categoryOptions}
              name="category"
              defaultValue={draft?.payload.category ?? "OTHER"}
            >
              <SelectTrigger
                className={styles.editorControl}
                id="draft-category"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(!draft || draft.operation === "CREATE") && (
            <>
              <div className={styles.editorField}>
                <Label htmlFor="draft-impact">Impacto</Label>
                <Select
                  items={impactOptions}
                  name="impact"
                  required
                  defaultValue={draft?.payload.impact}
                >
                  <SelectTrigger
                    className={styles.editorControl}
                    id="draft-impact"
                  >
                    <SelectValue placeholder="Selecione o impacto" />
                  </SelectTrigger>
                  <SelectContent>
                    {impactOptions.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className={styles.editorField}>
                <Label htmlFor="draft-urgency">Urgência</Label>
                <Select
                  items={urgencyOptions}
                  name="urgency"
                  required
                  defaultValue={draft?.payload.urgency}
                >
                  <SelectTrigger
                    className={styles.editorControl}
                    id="draft-urgency"
                  >
                    <SelectValue placeholder="Selecione a urgência" />
                  </SelectTrigger>
                  <SelectContent>
                    {urgencyOptions.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
        <p className={styles.editorHint}>
          Pessoa afetada:{" "}
          {draft && draft.operation !== "CREATE"
            ? "mantida do chamado"
            : "você"}
        </p>
        <div className={styles.options}>
          <Button type="submit" disabled={busy} className={styles.primary}>
            Rever rascunho
          </Button>
          <Button
            variant="outline"
            className={styles.optionButton}
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Fechar
          </Button>
        </div>
      </form>
    </Card>
  )
}
