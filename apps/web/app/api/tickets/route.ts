import { NextResponse } from "next/server"
import { getPrismaClient } from "../../../../../src/lib/prisma"
import {
  createTicketService,
  TicketServiceError,
} from "../../../../../src/services/tickets"
import { currentEmployee } from "@/lib/auth"

export const runtime = "nodejs"

export async function GET() {
  try {
    const user = await currentEmployee()
    if (!user)
      return NextResponse.json({ error: "Sessão necessária." }, { status: 401 })
    const tickets = await createTicketService(getPrismaClient()).list(user.id)
    return NextResponse.json(
      { tickets },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    if (error instanceof TicketServiceError && error.code === "UNAVAILABLE")
      return NextResponse.json({ error: error.message }, { status: 503 })
    console.error("Falha ao listar chamados:", error)
    return NextResponse.json(
      { error: "Não foi possível consultar os chamados." },
      { status: 503 }
    )
  }
}
