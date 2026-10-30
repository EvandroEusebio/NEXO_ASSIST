import Link from "next/link"
import { MessageSquare, UserRound } from "lucide-react"
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
import { LogoutButton } from "@/app/tickets/logout-button"
import { styles } from "@/app/chat/styles"

export function EmployeeSidebar({
  user,
  active,
}: {
  user: { name: string; email: string }
  active: "chat" | "profile"
}) {
  return (
    <aside className={styles.sidebar}>
      <Link href="/chat" className={styles.brand}>
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M2 4 7 1l12 10V3l5-2v19l-5 3L7 13v8l-5 2Z" />
        </svg>
        Nexo Assist
      </Link>
      <nav className={styles.nav} aria-label="Navegação principal">
        <Link
          href="/chat"
          aria-current={active === "chat" ? "page" : undefined}
          className={`${styles.navItem} ${active === "chat" ? styles.active : ""}`}
        >
          <MessageSquare size={16} />
          Atendimento
        </Link>
        <Link
          href="/profile"
          aria-current={active === "profile" ? "page" : undefined}
          className={`${styles.navItem} ${active === "profile" ? styles.active : ""}`}
        >
          <UserRound size={16} />
          Meu perfil
        </Link>
      </nav>
      <div className={styles.account}>
        <div className={styles.identity}>
          <Avatar className={styles.avatar}>
            <AvatarFallback className={styles.avatarFallback}>
              {user.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <strong className={styles.identityName}>{user.name}</strong>
            <small className={styles.identityEmail}>{user.email}</small>
          </div>
        </div>
        <LogoutButton />
      </div>
    </aside>
  )
}
