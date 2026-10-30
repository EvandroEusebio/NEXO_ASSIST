import { NextResponse } from "next/server"
import {
  AuthError,
  SESSION_MAX_AGE_SECONDS,
} from "../../../../../../src/services/auth"
import { authService, sameOrigin, SESSION_COOKIE_NAME } from "@/lib/auth"

export const runtime = "nodejs"

export async function POST(request: Request) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 })

  let input: unknown
  try {
    input = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Dados de login inválidos." },
      { status: 400 }
    )
  }

  try {
    const { token, user, rememberMe } = await authService().login(input)
    const response = NextResponse.json({ user })
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      ...(rememberMe ? { maxAge: SESSION_MAX_AGE_SECONDS } : {}),
    })
    response.headers.set("Cache-Control", "no-store")
    return response
  } catch (error) {
    if (error instanceof AuthError)
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "INVALID_INPUT" ? 400 : 401 }
      )
    console.error("Falha no login:", error)
    return NextResponse.json(
      { error: "Serviço de login indisponível." },
      { status: 503 }
    )
  }
}
