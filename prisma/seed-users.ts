import type { PrismaClient } from "../src/generated/prisma/client"
import { hashPassword } from "../src/lib/password"
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "../src/contracts/password"

/** Initial credentials for local example accounts; never reset an existing password. */
export const demoAccounts = [
  {
    name: "Ana Souza",
    email: "ana.souza@nexo.com.br",
    role: "EMPLOYEE",
    initialPassword: "Ana@NexoAssist2026!",
  },
  {
    name: "Bruno Tavares",
    email: "bruno.tavares@nexo.com.br",
    role: "EMPLOYEE",
    initialPassword: "Bruno@NexoAssist2026!",
  },
  {
    name: "Carla Mendes",
    email: "carla.mendes@nexo.com.br",
    role: "EMPLOYEE",
    initialPassword: "Carla@NexoAssist2026!",
  },
  {
    name: "Rafael Lima",
    email: "rafael.lima@nexo.com.br",
    role: "ANALYST",
    initialPassword: "Rafael@NexoAssist2026!",
  },
  {
    name: "Marta Alves",
    email: "marta.alves@nexo.com.br",
    role: "ANALYST",
    initialPassword: "Marta@NexoAssist2026!",
  },
  {
    name: "João Santos",
    email: "joao.santos@nexo.com.br",
    role: "ANALYST",
    initialPassword: "Joao@NexoAssist2026!",
  },
] as const
export function initialPassword(account: (typeof demoAccounts)[number]) {
  const password = process.env.SEED_INITIAL_PASSWORD || account.initialPassword
  if (
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  )
    throw new Error("A senha inicial deve ter entre 15 e 128 caracteres.")
  return password
}
export async function seedUsers(db: PrismaClient) {
  const profiles = [
    ...demoAccounts.map(({ initialPassword: _, ...profile }) => ({
      ...profile,
      demoLoginEnabled: true,
    })),
    {
      name: "Diego Ramos",
      email: "diego.ramos@nexo.com.br",
      role: "EMPLOYEE" as const,
      demoLoginEnabled: false,
    },
    {
      name: "Elisa Prado",
      email: "elisa.prado@nexo.com.br",
      role: "EMPLOYEE" as const,
      demoLoginEnabled: false,
    },
  ]
  const hashes = new Map<string, string>()
  for (const account of demoAccounts) {
    const current = await db.user.findUnique({
      where: { email: account.email },
      select: { passwordHash: true },
    })
    if (!current?.passwordHash)
      hashes.set(account.email, await hashPassword(initialPassword(account)))
  }
  return db.$transaction(async (tx) => {
    const ids = new Map<string, string>()
    for (const profile of profiles) {
      const saved = await tx.user.upsert({
        where: { email: profile.email },
        create: profile,
        update: profile,
      })
      const passwordHash = hashes.get(profile.email)
      if (passwordHash)
        await tx.user.updateMany({
          where: { id: saved.id, passwordHash: null },
          data: { passwordHash, passwordChangedAt: new Date() },
        })
      ids.set(profile.email, saved.id)
    }
    return ids
  })
}
