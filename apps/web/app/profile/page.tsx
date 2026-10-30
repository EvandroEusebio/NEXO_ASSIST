import { redirect } from "next/navigation"
import { ChevronRight, LockKeyhole } from "lucide-react"
import { currentEmployee } from "@/lib/auth"
import { EmployeeSidebar } from "@/components/employee-sidebar"
import { Card } from "@workspace/ui/components/card"
import { styles } from "../chat/styles"
import { PasswordSettings } from "./password-settings"
import { getPrismaClient } from "../../../../src/lib/prisma"

export default async function ProfilePage() {
  const user = await currentEmployee()
  if (!user) redirect("/login")
  const profile = await getPrismaClient().user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordChangedAt: true },
  })
  return (
    <main className={styles.screen}>
      <EmployeeSidebar user={user} active="profile" />
      <section className={styles.workspace}>
        <header className={styles.header}>
          <span className={styles.breadcrumb}>
            Service desk de TI <ChevronRight size={15} />
            <strong className={styles.headerTitle}>Meu perfil</strong>
          </span>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-[calc(100%_-_40px)] max-w-[600px] pt-12 pb-8 max-[700px]:pt-7">
            <h1 className="text-2xl font-bold tracking-tight">Meu perfil</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Seus dados de acesso ao service desk de TI.
            </p>
            <Card className="mt-8 block gap-0 overflow-hidden rounded-[18px] border-border py-0 shadow-sm">
              <dl className="divide-y divide-border">
                <div className="grid min-h-[58px] grid-cols-[160px_1fr] items-center gap-4 px-6 py-4 max-[700px]:grid-cols-1 max-[700px]:gap-1">
                  <dt className="text-[13px] text-muted-foreground">Nome</dt>
                  <dd>{user.name}</dd>
                </div>
                <div className="flex min-h-[58px] flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4">
                  <dt className="w-40 text-[13px] text-muted-foreground">
                    E-mail corporativo
                  </dt>
                  <dd className="min-w-0 break-all">{user.email}</dd>
                  <dd className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                    <LockKeyhole size={13} />
                    Gerenciado pela TI
                  </dd>
                </div>
              </dl>
            </Card>
            <PasswordSettings
              changedAt={profile.passwordChangedAt?.toISOString() ?? null}
            />
          </div>
        </div>
      </section>
    </main>
  )
}
