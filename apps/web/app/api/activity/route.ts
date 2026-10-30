import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { sameOrigin, SESSION_COOKIE_NAME } from "@/lib/auth"
import { getPrismaClient } from "../../../../../src/lib/prisma"
import {
  ActivityError,
  createActivityService,
} from "../../../../../src/services/activity"
export const runtime = "nodejs"
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 })
  try {
    const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value
    return NextResponse.json(
      await createActivityService(getPrismaClient()).heartbeat(
        token,
        await request.json()
      ),
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof ActivityError
            ? error.message
            : "Não foi possível atualizar a atividade.",
      },
      {
        status:
          error instanceof ActivityError
            ? error.status
            : error instanceof SyntaxError
              ? 400
              : 503,
      }
    )
  }
}
