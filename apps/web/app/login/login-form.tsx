"use client"

import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { styles } from "./styles"

export function LoginNotice({ kind }: { kind: "password" | "privacy" }) {
  const [open, setOpen] = useState(false)
  const isPassword = kind === "password"
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="link"
        className={`${styles.textLink} ${!isPassword ? "text-xs text-muted-foreground" : ""}`}
        type="button"
        onClick={() => setOpen(true)}
      >
        {isPassword ? "Esqueci minha senha" : "Privacidade e uso de dados"}
      </Button>
      <DialogContent className={styles.dialog}>
        <DialogHeader>
          <DialogTitle className="text-xl">
            {isPassword ? "Ajuda para entrar" : "Privacidade e uso de dados"}
          </DialogTitle>
          <DialogDescription>
            {isPassword
              ? "Nesta demonstração, use o e-mail de um funcionário dos dados de exemplo e qualquer senha não vazia. Não é necessário redefinir a senha."
              : "Esta demonstração usa funcionários e chamados de exemplo. A senha informada não é armazenada. Um cookie mantém a sua sessão e permite consultar os chamados da conta escolhida. Ao sair, a sessão é revogada."}
          </DialogDescription>
        </DialogHeader>
        {isPassword && (
          <a className={styles.dialogLink} href="tel:4000">
            Ligue no ramal 4000
          </a>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function LoginForm() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setPending(true)
    const form = new FormData(event.currentTarget)
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
          rememberMe,
        }),
      })
      if (!response.ok) {
        const result = (await response.json()) as { error?: string }
        setError(result.error ?? "Não foi possível iniciar sessão.")
        return
      }
      const result = (await response.json()) as { user: { role: string } }
      router.replace(result.user.role === "ANALYST" ? "/analyst" : "/chat")
      router.refresh()
    } catch {
      setError("Não foi possível ligar ao serviço. Tente novamente.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className={styles.form}>
      <div className={styles.field}>
        <Label className={styles.fieldLabel} htmlFor="email">
          E-mail corporativo
        </Label>
        <div className={`${styles.inputWrap} mt-1.5`}>
          <Mail size={16} aria-hidden="true" />
          <Input
            className={styles.input}
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            defaultValue="ana.souza@nexo.com.br"
            maxLength={320}
          />
        </div>
      </div>
      <div className={`${styles.field} ${styles.nextField}`}>
        <div className={styles.passwordLabel}>
          <Label className={styles.fieldLabel} htmlFor="password">
            Senha
          </Label>
          <LoginNotice kind="password" />
        </div>
        <div className={`${styles.inputWrap} ${styles.passwordWrap} mt-1.5`}>
          <LockKeyhole size={16} aria-hidden="true" />
          <Input
            className={`${styles.input} ${styles.passwordInput}`}
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder="••••••••••"
            maxLength={256}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={showPassword}
            className={styles.eye}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </Button>
        </div>
      </div>
      <div className={styles.remember}>
        <Checkbox
          className={styles.checkbox}
          id="rememberMe"
          checked={rememberMe}
          onCheckedChange={setRememberMe}
        />
        <Label className={styles.rememberLabel} htmlFor="rememberMe">
          Manter conectado neste computador
        </Label>
      </div>
      {error && (
        <Alert variant="destructive" className={styles.error}>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button disabled={pending} type="submit" className={styles.submit}>
        {pending ? "A entrar…" : "Entrar"}
        <ArrowRight size={16} aria-hidden="true" />
      </Button>
    </form>
  )
}
