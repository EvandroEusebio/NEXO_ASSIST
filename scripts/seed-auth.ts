import "dotenv/config"
import { createPrismaClient } from "../src/lib/prisma"
import { seedUsers } from "../prisma/seed-users"
const db = createPrismaClient()
try {
  await seedUsers(db)
  console.log(
    "Contas preparadas: 3 EMPLOYEE e 3 ANALYST. Senhas existentes e chamados preservados. Credenciais iniciais em AUTH_DEMO.md."
  )
} finally {
  await db.$disconnect()
}
