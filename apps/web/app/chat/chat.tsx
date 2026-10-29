"use client"
import { useEffect, useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import {
  ArrowUp,
  Check,
  ChevronRight,
  MessageSquare,
  Plus,
  UserRound,
} from "lucide-react"
import { LogoutButton } from "../tickets/logout-button"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
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
  type ChatTicket,
  type ConversationSummary,
  type DraftFields,
} from "../../../../src/contracts/chat"
import { styles } from "./styles"

type User = { name: string; email: string }
const typeOptions = [
  { value: "INC", label: "Incidente · algo deixou de funcionar" },
  { value: "REQ", label: "Requisição · novo pedido" },
]
const categoryOptions = Object.entries(categoryLabels).map(
  ([value, label]) => ({ value, label })
)
const priorityOptions = Object.entries(priorityLabels).map(
  ([value, label]) => ({ value, label })
)
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

function TicketCard({ ticket }: { ticket: ChatTicket }) {
  const overdue =
    ticket.nextResponseDueAt &&
    !["RESOLVED", "CLOSED"].includes(ticket.status) &&
    new Date(ticket.nextResponseDueAt).getTime() < Date.now()
  return (
    <Card className={styles.card}>
      <div className={styles.cardHeading}>
        <span>Chamado · {ticket.number}</span>
        <Badge
          variant="secondary"
          className={overdue ? styles.warning : undefined}
        >
          ● {statusLabels[ticket.status]}
        </Badge>
      </div>
      <h3 className={styles.cardTitle}>{ticket.title}</h3>
      <p className={styles.cardDescription}>{ticket.description}</p>
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt className={styles.factLabel}>Categoria</dt>
          <dd className={styles.factValue}>
            {categoryLabels[ticket.category]}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.factLabel}>Prioridade</dt>
          <dd className={styles.factValue}>
            {priorityLabels[ticket.priority]}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.factLabel}>Aberto em</dt>
          <dd className={styles.factValue}>{date(ticket.createdAt)}</dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.factLabel}>Próxima resposta</dt>
          <dd
            className={`${styles.factValue} ${overdue ? styles.warning : ""}`}
          >
            {ticket.nextResponseDueAt
              ? `${date(ticket.nextResponseDueAt)}${overdue ? " · prazo vencido" : ""}`
              : "Prazo não definido"}
          </dd>
        </div>
      </dl>
    </Card>
  )
}

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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [reconnecting, setReconnecting] = useState(false)
  const [retry, setRetry] = useState<PendingRequest | null>(null)
  const [editor, setEditor] = useState<{ draft?: ChatDraft } | null>(null)
  const currentId = useRef(initial?.id ?? null)
  const pending = useRef(false)
  const bottom = useRef<HTMLDivElement>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const count = snapshot?.messageCount ?? 0
  const limited = count >= MESSAGE_LIMIT
  const human = snapshot && snapshot.status !== "AGENT_ACTIVE"
  const disabled = busy || limited || snapshot?.status === "CLOSED"
  const conversationId = snapshot?.id

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
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" })
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
            {draft.operation === "UPDATE"
              ? `Atualizar ${draft.targetTicket?.number}`
              : "Novo chamado"}{" "}
            · Rascunho {draft.id.slice(0, 8)}
          </span>
          <Badge
            variant="secondary"
            className={draft.status === "PENDING" ? styles.warning : undefined}
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
              {draft.operation === "UPDATE"
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
                  draft.operation === "UPDATE"
                    ? "Confirmo a atualização deste chamado."
                    : "Confirmo a criação deste chamado.",
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
      <aside className={styles.sidebar}>
        <Link href="/chat" className={styles.brand}>
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M2 4 7 1l12 10V3l5-2v19l-5 3L7 13v8l-5 2Z" />
          </svg>
          Nexo Assist
        </Link>
        <nav className={styles.nav}>
          <Link href="/chat" className={`${styles.navItem} ${styles.active}`}>
            <MessageSquare size={16} />
            Atendimento
          </Link>
          <Link
            className={styles.navItem}
            href="#"
            onClick={() => setProfileOpen(true)}
          >
            <UserRound size={16} />
            Meu perfil
          </Link>
        </nav>
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
            items={history.map((c) => ({ value: c.id, label: c.title }))}
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
                  {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className={styles.account}>
          <div className={styles.identity}>
            <Avatar className={styles.avatar}>
              <AvatarFallback className={styles.avatarFallback}>
                {user.name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </AvatarFallback>
            </Avatar>
            <div>
              <strong className={styles.identityName}>{user.name}</strong>
              <small className={styles.identityEmail}>{user.email}</small>
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>
      <section className={styles.workspace}>
        <header className={styles.header}>
          <span className={styles.breadcrumb}>
            Service desk de TI <ChevronRight size={15} />
            <strong className={styles.headerTitle}>Atendimento</strong>
          </span>
          <Badge
            variant="secondary"
            className={human ? styles.waitingBadge : styles.online}
          >
            {human ? "● Aguardando atendimento" : "● Assistente online"}
          </Badge>
        </header>
        <div className={styles.scroll}>
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
                      {meta?.activity && (
                        <span className={styles.messageActivity}>
                          <Check size={12} />
                          {meta.activity}
                        </span>
                      )}
                    </div>
                  )}
                  <div
                    className={`${styles.bubble} ${message.author === "EMPLOYEE" ? styles.employeeBubble : ""}`}
                  >
                    {message.content}
                  </div>
                  {meta?.kind === "welcome" && !human && quickOptions()}
                  {meta?.kind === "tickets" && (
                    <div className={styles.ticketList}>
                      {snapshot.tickets.map((t) => (
                        <Button
                          variant="outline"
                          className={styles.ticketButton}
                          key={t.number}
                          disabled={disabled || !!human}
                          onClick={() =>
                            void send(`${t.number} · ${t.title}`, {
                              type: "ticket",
                              number: t.number,
                            })
                          }
                        >
                          <span className={styles.radio} />
                          <small className={styles.ticketMeta}>
                            {t.number}
                          </small>
                          <strong className={styles.ticketTitle}>
                            {t.title}
                          </strong>
                          <span className={styles.ticketMeta}>
                            {statusLabels[t.status]}
                          </span>
                        </Button>
                      ))}
                    </div>
                  )}
                  {ticket && (
                    <>
                      <TicketCard ticket={ticket} />
                      {!human && (
                        <div className={styles.options}>
                          <Button
                            variant="outline"
                            className={styles.optionButton}
                            disabled={disabled}
                            onClick={() =>
                              void send(
                                `Quero falar com um analista sobre ${ticket.number}.`,
                                { type: "handoff" }
                              )
                            }
                          >
                            Falar com um analista
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                  {latestDraft && renderDraft(draft)}
                </div>
              )
            })}
            {human && (
              <p className={styles.notice}>
                A conversa está com o atendimento humano. As respostas
                automáticas estão pausadas.
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
            <div ref={bottom} />
          </div>
        </div>
        <div className={styles.composerArea}>
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
              className={styles.composerInput}
              aria-label="Mensagem para o Nexo"
              placeholder="Escreva para o Nexo…"
              value={content}
              maxLength={4000}
              disabled={disabled}
              onChange={(e) => setContent(e.target.value)}
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
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className={styles.dialog}>
          <DialogHeader>
            <DialogTitle className={styles.dialogTitle}>Meu perfil</DialogTitle>
            <DialogDescription>Informações da conta em uso.</DialogDescription>
          </DialogHeader>
          <p className={styles.dialogText}>{user.name}</p>
          <p className={styles.dialogText}>{user.email}</p>
          <Link className={styles.dialogLink} href="/tickets">
            Ver meus chamados
          </Link>
          <LogoutButton />
        </DialogContent>
      </Dialog>
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
        draft?.operation === "UPDATE"
          ? draft.payload.type
          : (data.get("type") as "INC" | "REQ"),
      category: String(data.get("category")),
      priority: String(data.get("priority")),
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
              disabled={draft?.operation === "UPDATE"}
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
          <div className={styles.editorField}>
            <Label htmlFor="draft-priority">Prioridade</Label>
            <Select
              items={priorityOptions}
              name="priority"
              defaultValue={draft?.payload.priority ?? "MEDIUM"}
            >
              <SelectTrigger
                className={styles.editorControl}
                id="draft-priority"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {priorityOptions.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className={styles.editorHint}>
          Pessoa afetada:{" "}
          {draft?.operation === "UPDATE" ? "mantida do chamado" : "você"}
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
