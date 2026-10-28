import { createHash, randomBytes } from "node:crypto"
import { z } from "zod"
import type { PrismaClient } from "../generated/prisma/client.ts"

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

const credentials = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
    password: z.string().min(1).max(256),
    rememberMe: z.boolean().default(true),
  })
  .strict()

export type AuthUser = {
  id: string
  name: string
  email: string
  role: "EMPLOYEE"
}

export class AuthError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "INVALID_CREDENTIALS") {
    super(
      code === "INVALID_INPUT"
        ? "Informe e-mail e senha válidos."
        : "E-mail ou senha inválidos."
    )
    this.name = "AuthError"
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function validToken(token: string | undefined): token is string {
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token)
}

/** Authentication for seeded employees only. Passwords are intentionally ignored in this demo. */
export function createAuthService(db: PrismaClient) {
  return {
    async login(
      input: unknown
    ): Promise<{ token: string; user: AuthUser; rememberMe: boolean }> {
      const parsed = credentials.safeParse(input)
      if (!parsed.success) throw new AuthError("INVALID_INPUT")
      const { email } = parsed.data
      if (!email.endsWith("@nexo.com.br"))
        throw new AuthError("INVALID_CREDENTIALS")

      const user = await db.user.findUnique({
        where: { email },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          demoLoginEnabled: true,
        },
      })
      if (!user || user.role !== "EMPLOYEE" || !user.demoLoginEnabled)
        throw new AuthError("INVALID_CREDENTIALS")

      const token = randomBytes(32).toString("hex")
      await db.authSession.create({
        data: {
          tokenHash: hashToken(token),
          userId: user.id,
          expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
        },
      })
      return {
        token,
        rememberMe: parsed.data.rememberMe,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: "EMPLOYEE",
        },
      }
    },

    async currentUser(token: string | undefined): Promise<AuthUser | null> {
      if (!validToken(token)) return null
      const session = await db.authSession.findFirst({
        where: { tokenHash: hashToken(token), expiresAt: { gt: new Date() } },
        select: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              demoLoginEnabled: true,
            },
          },
        },
      })
      const user = session?.user
      if (!user || user.role !== "EMPLOYEE" || !user.demoLoginEnabled)
        return null
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: "EMPLOYEE",
      }
    },

    async logout(token: string | undefined): Promise<void> {
      if (!validToken(token)) return
      await db.authSession.deleteMany({
        where: { tokenHash: hashToken(token) },
      })
    },
  }
}
