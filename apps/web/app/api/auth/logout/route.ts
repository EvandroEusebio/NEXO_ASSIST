import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { authService, sameOrigin, SESSION_COOKIE_NAME } from "@/lib/auth"

export const runtime = "nodejs"

export async function POST(request: Request) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 })

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value
  try {
    await authService().logout(token)
  } catch (error) {
    console.error("Falha ao terminar sessão:", error)
    return NextResponse.json(
      { error: "Não foi possível terminar a sessão." },
      { status: 503 }
    )
  }
  const response = NextResponse.json({ ok: true })
  response.cookies.delete(SESSION_COOKIE_NAME)
  response.headers.set("Cache-Control", "no-store")
  return response
}
