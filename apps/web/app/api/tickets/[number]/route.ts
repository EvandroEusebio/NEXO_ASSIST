import { NextResponse } from "next/server"
import { getPrismaClient } from "../../../../../../src/lib/prisma"
import {
  createTicketService,
  TicketServiceError,
} from "../../../../../../src/services/tickets"
import { currentEmployee } from "@/lib/auth"

export const runtime = "nodejs"

export async function GET(
  _request: Request,
  context: { params: Promise<{ number: string }> }
) {
  try {
    const user = await currentEmployee()
    if (!user)
      return NextResponse.json({ error: "Sessão necessária." }, { status: 401 })
    const { number } = await context.params
    const ticket = await createTicketService(getPrismaClient()).get(
      user.id,
      number
    )
    return NextResponse.json(
      { ticket },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    if (error instanceof TicketServiceError) {
      const status =
        error.code === "NOT_FOUND"
          ? 404
          : error.code === "INVALID_INPUT"
            ? 400
            : error.code === "UNAVAILABLE"
              ? 503
              : 403
      return NextResponse.json({ error: error.message }, { status })
    }
    console.error("Falha ao consultar chamado:", error)
    return NextResponse.json(
      { error: "Não foi possível consultar o chamado." },
      { status: 503 }
    )
  }
}
