import "dotenv/config"
import { seedUsers } from "./seed-users"
import { createPrismaClient } from "../src/lib/prisma"
import type {
  TicketCategory,
  TicketPriority,
  TicketStatus,
  TicketType,
} from "../src/generated/prisma/client"

type SeedArticle = {
  id: string
  title: string
  content: string
  tags: string[]
}
type SeedTicket = {
  number: string
  ownerEmail: string
  affectedEmail?: string
  type: TicketType
  category: TicketCategory
  priority: TicketPriority
  status: TicketStatus
  title: string
  description: string
  createdAt: Date
  lastResponseAt: Date | null
  nextResponseDueAt: Date | null
  resolvedAt: Date | null
}

const now = new Date()
const hoursFromNow = (hours: number) =>
  new Date(now.getTime() + hours * 60 * 60 * 1000)

// IDs estáveis permitem repetir o seed sem exigir uma migração para acrescentar slug.
const articles: SeedArticle[] = [
  {
    id: "8de6442f-719e-4be5-a918-000000000001",
    title: "VPN: erro 809 no Windows 10",
    content:
      "No Windows 10, reinstale o cliente VPN pelo portal de softwares e reinicie o computador. Esta orientação não se aplica ao Windows 11; nesse caso, abra um chamado.",
    tags: ["vpn", "erro 809", "windows 10", "rede"],
  },
  {
    id: "8de6442f-719e-4be5-a918-000000000002",
    title: "Horário do service desk",
    content:
      "O service desk atende de segunda a sexta-feira, das 8h às 18h. Chamados críticos têm plantão 24 horas.",
    tags: ["horário", "atendimento", "plantão", "sla"],
  },
  {
    id: "8de6442f-719e-4be5-a918-000000000003",
    title: "Senha do SAP bloqueada",
    content:
      "Se a sua senha do SAP foi bloqueada, confirme a mensagem exibida e solicite o desbloqueio pelo service desk. Não envie a sua senha pelo chat.",
    tags: ["sap", "senha", "acesso"],
  },
  {
    id: "8de6442f-719e-4be5-a918-000000000004",
    title: "Outlook não sincroniza no telemóvel",
    content:
      "Verifique a ligação à internet e tente sincronizar novamente. Se o problema persistir, informe o modelo do aparelho, a versão do sistema e a mensagem de erro para abrir um incidente.",
    tags: ["outlook", "e-mail", "telemóvel", "sincronização"],
  },
  {
    id: "8de6442f-719e-4be5-a918-000000000005",
    title: "Notebook lento após atualização",
    content:
      "Reinicie o notebook e execute o diagnóstico disponível na central de ajuda. Se a lentidão continuar, descreva quando começou e quais aplicações foram afetadas para abrir um incidente.",
    tags: ["notebook", "hardware", "windows", "lentidão"],
  },
  {
    id: "8de6442f-719e-4be5-a918-000000000006",
    title: "Acesso a pasta compartilhada",
    content:
      "Para pedir acesso novo, indique o endereço da pasta e a pessoa responsável pela aprovação. Se perdeu acesso que já possuía, informe desde quando ocorre e a mensagem de erro.",
    tags: ["sharepoint", "pasta", "permissão", "acesso"],
  },
  {
    id: "8de6442f-719e-4be5-a918-000000000007",
    title: "Pedido de segundo monitor",
    content:
      "Peça um segundo monitor pelo service desk. Informe a necessidade, o local de entrega e a pessoa afetada para que a requisição seja encaminhada à aprovação.",
    tags: ["monitor", "equipamento", "requisição", "hardware"],
  },
  {
    id: "8de6442f-719e-4be5-a918-000000000008",
    title: "Instalação de software autorizado",
    content:
      "Consulte primeiro o portal de softwares da Nexo. Se a aplicação não estiver disponível, abra uma requisição com o nome do software, a finalidade e a pessoa afetada.",
    tags: ["software", "instalação", "requisição"],
  },
]

// Datas ilustrativas: o cálculo formal de SLA será implementado na fase 3.
const tickets: SeedTicket[] = [
  {
    number: "INC-20311",
    ownerEmail: "ana.souza@nexo.com.br",
    type: "INC",
    category: "HARDWARE",
    priority: "MEDIUM",
    status: "WAITING_ANALYST",
    title: "Notebook lento após atualização do Windows",
    description:
      "A lentidão começou após a atualização do Windows. Reiniciar e executar o diagnóstico da central não resolveu.",
    createdAt: hoursFromNow(-144),
    lastResponseAt: hoursFromNow(-120),
    nextResponseDueAt: hoursFromNow(-48),
    resolvedAt: null,
  },
  {
    number: "INC-20298",
    ownerEmail: "ana.souza@nexo.com.br",
    type: "INC",
    category: "ACCESS",
    priority: "MEDIUM",
    status: "IN_PROGRESS",
    title: "Perda de acesso à pasta Financeiro no SharePoint",
    description:
      "Ana deixou de conseguir abrir a pasta Financeiro, à qual já tinha acesso. O SharePoint mostra acesso negado.",
    createdAt: hoursFromNow(-48),
    lastResponseAt: hoursFromNow(-6),
    nextResponseDueAt: hoursFromNow(24),
    resolvedAt: null,
  },
  {
    number: "REQ-10442",
    ownerEmail: "ana.souza@nexo.com.br",
    type: "REQ",
    category: "HARDWARE",
    priority: "LOW",
    status: "APPROVED",
    title: "Segundo monitor para home office",
    description:
      "Ana solicitou um segundo monitor para trabalhar em casa. O pedido foi aprovado e aguarda entrega.",
    createdAt: hoursFromNow(-96),
    lastResponseAt: hoursFromNow(-48),
    nextResponseDueAt: hoursFromNow(24),
    resolvedAt: null,
  },
  {
    number: "INC-20150",
    ownerEmail: "ana.souza@nexo.com.br",
    type: "INC",
    category: "ACCESS",
    priority: "MEDIUM",
    status: "RESOLVED",
    title: "Senha do SAP bloqueada",
    description: "A conta de Ana no SAP foi desbloqueada pelo suporte.",
    createdAt: hoursFromNow(-240),
    lastResponseAt: hoursFromNow(-96),
    nextResponseDueAt: null,
    resolvedAt: hoursFromNow(-96),
  },
  {
    number: "INC-20517",
    ownerEmail: "bruno.tavares@nexo.com.br",
    type: "INC",
    category: "NETWORK_VPN",
    priority: "HIGH",
    status: "OPEN",
    title: "VPN não conecta no Windows 11 — erro 809",
    description:
      "Bruno não consegue conectar à VPN no Windows 11 e tem uma reunião com cliente no mesmo dia. Aparece o erro 809.",
    createdAt: hoursFromNow(-1),
    lastResponseAt: null,
    nextResponseDueAt: hoursFromNow(3),
    resolvedAt: null,
  },
  {
    number: "REQ-10510",
    ownerEmail: "carla.mendes@nexo.com.br",
    type: "REQ",
    category: "ACCESS",
    priority: "HIGH",
    status: "OPEN",
    title: "Novo acesso ao SAP para fechamento financeiro",
    description:
      "Carla precisa de acesso ao módulo financeiro do SAP para uma atividade com prazo no mesmo dia.",
    createdAt: hoursFromNow(-2),
    lastResponseAt: null,
    nextResponseDueAt: hoursFromNow(2),
    resolvedAt: null,
  },
  {
    number: "INC-20518",
    ownerEmail: "diego.ramos@nexo.com.br",
    type: "INC",
    category: "NETWORK_VPN",
    priority: "CRITICAL",
    status: "OPEN",
    title: "Rede indisponível para toda a equipa de operações",
    description:
      "A equipa de operações está sem ligação à rede corporativa; ninguém consegue aceder aos sistemas de trabalho.",
    createdAt: hoursFromNow(-0.5),
    lastResponseAt: null,
    nextResponseDueAt: hoursFromNow(0.5),
    resolvedAt: null,
  },
  {
    number: "INC-20480",
    ownerEmail: "elisa.prado@nexo.com.br",
    type: "INC",
    category: "EMAIL",
    priority: "MEDIUM",
    status: "RESOLVED",
    title: "Outlook não sincronizava no telemóvel",
    description:
      "A sincronização do Outlook no telemóvel de Elisa foi restabelecida pelo suporte.",
    createdAt: hoursFromNow(-432),
    lastResponseAt: hoursFromNow(-360),
    nextResponseDueAt: null,
    resolvedAt: hoursFromNow(-360),
  },
  {
    number: "REQ-10522",
    ownerEmail: "elisa.prado@nexo.com.br",
    type: "REQ",
    category: "SOFTWARE",
    priority: "LOW",
    status: "OPEN",
    title: "Licença de software para relatórios",
    description:
      "Elisa pediu uma licença de software para produzir relatórios mensais; não há urgência.",
    createdAt: hoursFromNow(-24),
    lastResponseAt: null,
    nextResponseDueAt: hoursFromNow(96),
    resolvedAt: null,
  },
]

async function main() {
  const prisma = createPrismaClient()
  try {
    const userIds = await seedUsers(prisma)
    await prisma.$transaction(async (tx) => {
      for (const article of articles) {
        await tx.helpArticle.upsert({
          where: { id: article.id },
          create: article,
          update: {
            title: article.title,
            content: article.content,
            tags: article.tags,
          },
        })
      }

      for (const ticket of tickets) {
        const openedById = userIds.get(ticket.ownerEmail)
        const affectedUserId = userIds.get(
          ticket.affectedEmail ?? ticket.ownerEmail
        )
        if (!openedById || !affectedUserId) {
          throw new Error(`Utilizador em falta para ${ticket.number}`)
        }

        const { ownerEmail, affectedEmail, ...fields } = ticket
        const data = { ...fields, openedById, affectedUserId }
        await tx.ticket.upsert({
          where: { number: ticket.number },
          create: data,
          update: data,
        })
      }
    })

    console.log(
      `Seed concluído: ${userIds.size} utilizadores, ${articles.length} artigos e ${tickets.length} chamados de demonstração.`
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error("Falha ao executar o seed:", error)
  process.exitCode = 1
})
