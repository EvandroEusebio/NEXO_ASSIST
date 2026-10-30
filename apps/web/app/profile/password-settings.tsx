"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { KeyRound, LockKeyhole, RotateCcw } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "../../../../src/contracts/password"

export function PasswordSettings({ changedAt }: { changedAt: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const form = event.currentTarget
    const data = new FormData(form)
    if (data.get("newPassword") !== data.get("confirmPassword")) {
      setError("A confirmação não coincide com a nova senha.")
      return
    }
    setPending(true)
    setError("")
    setSuccess(false)
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: data.get("currentPassword"),
          newPassword: data.get("newPassword"),
          confirmPassword: data.get("confirmPassword"),
        }),
      })
      const result = await response.json()
      if (!response.ok)
        throw new Error(result.error ?? "Não foi possível alterar a senha.")
      form.reset()
      setOpen(false)
      setSuccess(true)
      router.refresh()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível alterar a senha. Tente novamente."
      )
    } finally {
      setPending(false)
    }
  }
  return (
    <>
      <Card className="mt-8 block gap-0 overflow-hidden rounded-[18px] border-border py-0 shadow-sm">
        <div className="flex min-h-[88px] flex-wrap items-center gap-4 px-6 py-5">
          <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
            <KeyRound size={19} />
          </span>
          <div className="flex-1">
            <h2 className="font-medium">Senha</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {changedAt
                ? `Alterada em ${new Intl.DateTimeFormat("pt-PT", { dateStyle: "medium", timeZone: "Africa/Luanda" }).format(new Date(changedAt))}`
                : "Defina uma senha pessoal para proteger a sua conta."}
            </p>
          </div>
          <Button
            variant="outline"
            className="rounded-lg shadow-sm"
            onClick={() => {
              setError("")
              setOpen(true)
            }}
          >
            <RotateCcw size={15} />
            Alterar senha
          </Button>
        </div>
        <p className="flex min-h-10 items-center gap-2 border-t border-border bg-muted px-6 py-2 text-xs text-muted-foreground">
          <LockKeyhole size={14} className="shrink-0" />
          Use uma senha de 15 a 128 caracteres, incluindo espaços se desejar.
        </p>
      </Card>
      {success && (
        <p role="status" className="mt-3 text-sm text-emerald-700">
          Senha alterada com sucesso. As outras sessões foram encerradas.
        </p>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!pending) {
            setOpen(value)
            setError("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar senha</DialogTitle>
            <DialogDescription>
              Confirme a senha atual e escolha uma nova. As outras sessões da
              conta serão encerradas.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={submit}>
            <div className="grid gap-1.5">
              <Label htmlFor="current-password">Senha atual</Label>
              <Input
                id="current-password"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                maxLength={PASSWORD_MAX_LENGTH}
                required
                disabled={pending}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-password">Nova senha</Label>
              <Input
                id="new-password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                required
                disabled={pending}
                aria-describedby="password-policy"
              />
              <p id="password-policy" className="text-xs text-muted-foreground">
                Entre 15 e 128 caracteres. Escolha uma senha diferente da atual.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="confirm-password">Confirmar nova senha</Label>
              <Input
                id="confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                required
                disabled={pending}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="mt-1 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "A guardar…" : "Guardar nova senha"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
