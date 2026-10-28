import { NextResponse } from "next/server"
import { currentEmployee } from "@/lib/auth"

export const runtime = "nodejs"

export async function GET() {
  try {
    const user = await currentEmployee()
    return NextResponse.json(user ? { user } : { error: "Sessão inválida." }, {
      status: user ? 200 : 401,
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    console.error("Falha ao consultar sessão:", error)
    return NextResponse.json(
      { error: "Serviço indisponível." },
      { status: 503 }
    )
  }
}
