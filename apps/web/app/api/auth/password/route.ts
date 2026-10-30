import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { authService, sameOrigin, SESSION_COOKIE_NAME } from "@/lib/auth"
import { AuthError } from "../../../../../../src/services/auth"
export const runtime = "nodejs"
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 })
  try {
    const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value
    const session = await authService().changePassword(
      token,
      await request.json()
    )
    const response = NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } }
    )
    response.cookies.set(SESSION_COOKIE_NAME, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      ...(session.rememberMe ? { maxAge: session.maxAgeSeconds } : {}),
    })
    return response
  } catch (error) {
    if (error instanceof AuthError) {
      const status =
        error.code === "SESSION_REQUIRED" ||
        error.code === "CURRENT_PASSWORD_INVALID"
          ? 401
          : error.code === "FORBIDDEN"
            ? 403
            : error.code === "CONFLICT"
              ? 409
              : 400
      return NextResponse.json(
        { error: error.message },
        { status, headers: { "Cache-Control": "no-store" } }
      )
    }
    if (error instanceof SyntaxError)
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 })
    return NextResponse.json(
      { error: "Não foi possível alterar a senha. Tente novamente." },
      { status: 503 }
    )
  }
}
