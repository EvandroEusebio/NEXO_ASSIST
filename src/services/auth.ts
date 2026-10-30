import { createHash, randomBytes } from "node:crypto"
import { z } from "zod"
import type { PrismaClient } from "../generated/prisma/client.ts"
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
} from "../lib/password"
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "../contracts/password"

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7
const credentials = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
    password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
    rememberMe: z.boolean().default(true),
  })
  .strict()
const passwordChange = z
  .object({
    currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
    newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
    confirmPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  })
  .strict()
  .refine((data) => data.newPassword === data.confirmPassword)
const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  demoLoginEnabled: true,
  passwordHash: true,
} as const
export type AuthUser = {
  id: string
  name: string
  email: string
  role: "EMPLOYEE" | "ANALYST"
}
const errors = {
  INVALID_INPUT: "Informe e-mail e senha válidos.",
  INVALID_PASSWORD:
    "A nova senha deve ter entre 15 e 128 caracteres e a confirmação deve coincidir.",
  INVALID_CREDENTIALS: "E-mail ou senha inválidos.",
  SESSION_REQUIRED: "Entre novamente para alterar a senha.",
  FORBIDDEN: "Esta operação está disponível no perfil do funcionário.",
  CURRENT_PASSWORD_INVALID: "A senha atual está incorreta.",
  SAME_PASSWORD: "Escolha uma senha diferente da atual.",
  CONFLICT: "A conta mudou. Entre novamente e tente outra vez.",
} as const
export class AuthError extends Error {
  constructor(public readonly code: keyof typeof errors) {
    super(errors[code])
    this.name = "AuthError"
  }
}
function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}
function validToken(token: string | undefined): token is string {
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token)
}
function publicUser(user: AuthUser): AuthUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role }
}

export function createAuthService(db: PrismaClient) {
  return {
    async login(
      input: unknown
    ): Promise<{ token: string; user: AuthUser; rememberMe: boolean }> {
      const parsed = credentials.safeParse(input)
      if (!parsed.success) throw new AuthError("INVALID_INPUT")
      const { email, password, rememberMe } = parsed.data
      const user = email.endsWith("@nexo.com.br")
        ? await db.user.findUnique({ where: { email }, select: userSelect })
        : null
      const matches = await verifyPassword(
        password,
        user?.passwordHash ?? DUMMY_PASSWORD_HASH
      )
      if (!user || !user.demoLoginEnabled || !user.passwordHash || !matches)
        throw new AuthError("INVALID_CREDENTIALS")
      const token = randomBytes(32).toString("hex")
      const authenticated = await db.$transaction(async (tx) => {
        // Serialize with password changes so an old password cannot create a session afterwards.
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id}::uuid FOR UPDATE`
        const current = await tx.user.findUnique({
          where: { id: user.id },
          select: userSelect,
        })
        if (
          !current?.demoLoginEnabled ||
          current.passwordHash !== user.passwordHash
        )
          throw new AuthError("INVALID_CREDENTIALS")
        await tx.authSession.create({
          data: {
            tokenHash: hashToken(token),
            userId: current.id,
            rememberMe,
            expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
          },
        })
        return publicUser(current)
      })
      return { token, user: authenticated, rememberMe }
    },
    async currentUser(token: string | undefined): Promise<AuthUser | null> {
      if (!validToken(token)) return null
      const session = await db.authSession.findFirst({
        where: { tokenHash: hashToken(token), expiresAt: { gt: new Date() } },
        select: { user: { select: userSelect } },
      })
      const user = session?.user
      return user?.demoLoginEnabled && user.passwordHash
        ? publicUser(user)
        : null
    },
    async changePassword(token: string | undefined, input: unknown) {
      if (!validToken(token)) throw new AuthError("SESSION_REQUIRED")
      const parsed = passwordChange.safeParse(input)
      if (!parsed.success) throw new AuthError("INVALID_PASSWORD")
      const { currentPassword, newPassword } = parsed.data
      const tokenHash = hashToken(token)
      const session = await db.authSession.findFirst({
        where: { tokenHash, expiresAt: { gt: new Date() } },
        include: { user: { select: userSelect } },
      })
      if (!session?.user.demoLoginEnabled || !session.user.passwordHash)
        throw new AuthError("SESSION_REQUIRED")
      if (session.user.role !== "EMPLOYEE") throw new AuthError("FORBIDDEN")
      if (!(await verifyPassword(currentPassword, session.user.passwordHash)))
        throw new AuthError("CURRENT_PASSWORD_INVALID")
      if (currentPassword === newPassword) throw new AuthError("SAME_PASSWORD")
      const passwordHash = await hashPassword(newPassword)
      const nextToken = randomBytes(32).toString("hex")
      await db.$transaction(async (tx) => {
        const updated = await tx.user.updateMany({
          where: {
            id: session.user.id,
            role: "EMPLOYEE",
            demoLoginEnabled: true,
            passwordHash: session.user.passwordHash,
          },
          data: { passwordHash, passwordChangedAt: new Date() },
        })
        if (!updated.count) throw new AuthError("CONFLICT")
        const current = await tx.authSession.findFirst({
          where: { tokenHash, expiresAt: { gt: new Date() } },
        })
        if (!current) throw new AuthError("SESSION_REQUIRED")
        await tx.authSession.deleteMany({ where: { userId: session.user.id } })
        await tx.authSession.create({
          data: {
            tokenHash: hashToken(nextToken),
            userId: session.user.id,
            rememberMe: session.rememberMe,
            expiresAt: session.expiresAt,
          },
        })
      })
      return {
        token: nextToken,
        rememberMe: session.rememberMe,
        maxAgeSeconds: Math.max(
          1,
          Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)
        ),
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
