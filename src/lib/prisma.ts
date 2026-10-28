import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../generated/prisma/client"

export function createPrismaClient(
  connectionString = process.env.DATABASE_URL
) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to connect to PostgreSQL")
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  })
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export function getPrismaClient() {
  const client = globalForPrisma.prisma ?? createPrismaClient()
  globalForPrisma.prisma = client
  return client
}
