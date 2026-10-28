import { cookies } from "next/headers"
import { getPrismaClient } from "../../../src/lib/prisma"
import { createAuthService } from "../../../src/services/auth"

export const SESSION_COOKIE_NAME = "nexo_session"

export function authService() {
  return createAuthService(getPrismaClient())
}

export async function currentEmployee() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value
  return token ? authService().currentUser(token) : null
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin")
  const fetchSite = request.headers.get("sec-fetch-site")
  if (fetchSite === "cross-site") return false
  return !origin || origin === new URL(request.url).origin
}
