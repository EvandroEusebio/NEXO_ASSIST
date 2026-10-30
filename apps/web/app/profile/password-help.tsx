"use client"

import { useState } from "react"
import { KeyRound, Mail, RotateCcw } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@workspace/ui/components/dialog"

export function PasswordHelp() {
  const [open, setOpen] = useState(false)
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
              Acesso de demonstração
            </p>
          </div>
          <Button
            variant="outline"
            className="rounded-lg shadow-sm"
            onClick={() => setOpen(true)}
          >
            <RotateCcw size={15} />
            Redefinir senha
          </Button>
        </div>
        <p className="flex min-h-10 items-center gap-2 border-t border-border bg-muted px-6 py-2 text-xs text-muted-foreground">
          <Mail size={14} className="shrink-0" />A demonstração não envia
          e-mails de redefinição.
        </p>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Senha de demonstração</DialogTitle>
            <DialogDescription>
              Use seu e-mail corporativo cadastrado e qualquer senha não vazia.
              Este ambiente não armazena senhas nem envia links de redefinição.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            Para ajuda com a senha da rede Nexo, contacte a TI pelo ramal 4000.
          </p>
          <Button onClick={() => setOpen(false)}>Entendi</Button>
        </DialogContent>
      </Dialog>
    </>
  )
}
