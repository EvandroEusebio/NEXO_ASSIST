import { NextResponse } from "next/server"
import { currentEmployee, sameOrigin } from "./auth"
import { getPrismaClient } from "../../../src/lib/prisma"
import {
  createConversationService,
  ConversationError,
} from "../../../src/services/conversations"
import { TicketServiceError } from "../../../src/services/tickets"
import { AgentUnavailableError } from "../../../src/services/agent"
export const conversations = () => createConversationService(getPrismaClient())
export async function chatResponse(
  request: Request,
  operation: (employeeId: string) => Promise<unknown>
) {
  if (request.method !== "GET" && !sameOrigin(request))
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 })
  try {
    const user = await currentEmployee()
    if (!user)
      return NextResponse.json(
        { error: "Sessão expirada. Entre novamente." },
        { status: 401 }
      )
    return NextResponse.json(await operation(user.id), {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    if (error instanceof AgentUnavailableError)
      return NextResponse.json({ error: error.message }, { status: 503 })
    if (error instanceof ConversationError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      )
    if (error instanceof SyntaxError)
      return NextResponse.json({ error: "JSON inválido." }, { status: 400 })
    if (error instanceof TicketServiceError)
      return NextResponse.json(
        { error: error.message },
        {
          status:
            error.code === "NOT_FOUND"
              ? 404
              : error.code === "INVALID_INPUT"
                ? 400
                : error.code === "UNAVAILABLE"
                  ? 503
                  : 409,
        }
      )
    console.error("Falha na conversa:", error)
    return NextResponse.json(
      { error: "Não foi possível concluir o pedido. Tente novamente." },
      { status: 503 }
    )
  }
}
