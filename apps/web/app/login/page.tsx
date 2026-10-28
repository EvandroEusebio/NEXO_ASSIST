import { redirect } from "next/navigation"
import { currentEmployee } from "@/lib/auth"
import { LoginForm, LoginNotice } from "./login-form"
import { Card } from "@workspace/ui/components/card"
import { styles } from "./styles"

export default async function LoginPage() {
  const user = await currentEmployee()
  if (user) redirect("/chat")

  return (
    <main className={styles.screen}>
      <section className={styles.presentation}>
        <div className={styles.brand}>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M2 4 7 1l12 10V3l5-2v19l-5 3L7 13v8l-5 2Z" />
          </svg>
          <span>Nexo Assist</span>
        </div>
        <div className={styles.story}>
          <p className={styles.eyebrow}>Service desk de TI da Nexo</p>
          <h1 className={styles.headline}>
            Seu problema de TI, resolvido em uma conversa.
          </h1>
          <p className={styles.description}>
            Descreva o que está acontecendo. O assistente consulta seus
            chamados, busca na central de ajuda e chama um analista quando
            precisa.
          </p>
          <Card
            className={styles.preview}
            aria-label="Exemplo ilustrativo de atendimento"
          >
            <p className={styles.question}>
              Meu notebook não conecta na VPN. Erro 809.
            </p>
            <p className={styles.activity}>
              <strong className={styles.activityName}>Nexo Assist</strong>{" "}
              consultou seus chamados · criou um chamado
            </p>
            <p className={styles.answer}>
              Pronto: abri o chamado com prioridade alta. Um analista fala com
              você em até 4 h úteis.
            </p>
            <p className={styles.ticket}>
              <i className={styles.ticketDot} aria-hidden="true" />
              <strong className="font-semibold">INC-20517</strong>
              <span className="text-muted-foreground">
                Rede e VPN · Alta · em até 4 h
              </span>
            </p>
          </Card>
        </div>
        <div
          className={styles.stats}
          aria-label="Indicadores ilustrativos da demonstração"
        >
          <div className={styles.statItem}>
            <p className={styles.statValue}>
              8 <small className="text-2xl">s</small>
            </p>
            <span className={styles.statLabel}>
              primeira resposta, em média
            </span>
          </div>
          <div className={styles.statItem}>
            <p className={styles.statValue}>72%</p>
            <span className={styles.statLabel}>resolvidos sem fila</span>
          </div>
          <div className={styles.statItem}>
            <p className={styles.statValue}>
              6 <i className={styles.statDot} aria-hidden="true" />
            </p>
            <span className={styles.statLabel}>analistas online agora</span>
          </div>
        </div>
      </section>
      <section className={styles.authentication} aria-labelledby="login-title">
        <p className={styles.support}>
          Problema para entrar?{" "}
          <a className={styles.supportLink} href="tel:4000">
            Ligue no ramal 4000
          </a>
        </p>
        <div className={styles.formPanel}>
          <h2 id="login-title" className={styles.formTitle}>
            Entrar
          </h2>
          <p className={styles.subtitle}>
            Use seu e-mail corporativo e a senha da rede Nexo.
          </p>
          <LoginForm />
        </div>
        <footer className={styles.footer}>
          <span>© 2026 Nexo · Service desk de TI</span>
          <LoginNotice kind="privacy" />
        </footer>
      </section>
    </main>
  )
}
