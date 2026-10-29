import { NextResponse } from "next/server"
import { currentUser, sameOrigin } from "./auth"
import { getPrismaClient } from "../../../src/lib/prisma"
import {
  AnalystError,
  createAnalystService,
} from "../../../src/services/analyst"
export const analysts = () => createAnalystService(getPrismaClient())
export async function analystResponse(
  request: Request,
  operation: (id: string) => Promise<unknown>
) {
  if (request.method !== "GET" && !sameOrigin(request))
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 })
  try {
    const user = await currentUser()
    if (!user)
      return NextResponse.json({ error: "Entre novamente." }, { status: 401 })
    if (user.role !== "ANALYST")
      return NextResponse.json(
        { error: "Acesso reservado a analistas." },
        { status: 403 }
      )
    return NextResponse.json(await operation(user.id), {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    const status =
      error instanceof AnalystError
        ? error.status
        : error instanceof SyntaxError
          ? 400
          : 503
    return NextResponse.json(
      {
        error:
          error instanceof AnalystError
            ? error.message
            : "Não foi possível concluir o pedido.",
      },
      { status }
    )
  }
}
