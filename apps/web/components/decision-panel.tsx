"use client"

import { ChevronDown, ScanText } from "lucide-react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import type { PublicDecision } from "../../../src/contracts/decisions"

export function DecisionPanel({
  decision,
  unavailable = false,
}: {
  decision: PublicDecision | null
  unavailable?: boolean
}) {
  if (!decision && !unavailable) return null
  const confidence = decision?.confidence
  const level =
    confidence == null
      ? "Não registrada"
      : confidence < 0.65
        ? "Baixa"
        : confidence < 0.85
          ? "Moderada"
          : "Alta"
  return (
    <Collapsible className="mt-2 w-full min-w-0 rounded-lg border border-border bg-white text-left text-foreground">
      <CollapsibleTrigger
        render={<Button variant="ghost" />}
        className="group h-auto w-full justify-between gap-2 px-3 py-2 text-xs whitespace-normal"
      >
        <span className="flex items-center gap-2">
          <ScanText className="size-4 shrink-0 text-primary" />
          {decision?.source === "rule"
            ? "Entenda o encaminhamento"
            : "Entenda esta decisão"}
        </span>
        <ChevronDown className="size-4 shrink-0 transition-transform group-data-panel-open:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t px-3 py-3 text-xs leading-relaxed">
        {!decision ? (
          <p className="text-muted-foreground">
            Os detalhes desta decisão não foram registrados.
          </p>
        ) : (
          <>
            <dl className="space-y-3 break-words">
              <div>
                <dt className="font-semibold">O que foi entendido</dt>
                <dd className="mt-0.5 text-muted-foreground">
                  {decision.understanding}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Ferramenta utilizada</dt>
                <dd className="mt-0.5 text-muted-foreground">
                  {decision.source === "rule"
                    ? "Regra do atendimento"
                    : (decision.tool ?? "Não registrada nesta decisão")}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Ação realizada</dt>
                <dd className="mt-0.5 text-muted-foreground">
                  {decision.action}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Grau de segurança</dt>
                <dd className="mt-1">
                  <Badge variant="secondary">
                    {decision.source === "rule"
                      ? "Regra automática"
                      : `${level}${confidence == null ? "" : ` · ${Math.round(confidence * 100)}%`}`}
                  </Badge>
                  <p className="mt-1 text-muted-foreground">
                    {decision.source === "rule"
                      ? "Encaminhamento definido pelas regras do atendimento, sem estimativa do modelo."
                      : "Estimativa do próprio agente sobre a interpretação do pedido; não é garantia de acerto."}
                  </p>
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Justificativa</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-muted-foreground">
                  {decision.reason}
                </dd>
              </div>
              {decision.evidence && (
                <div>
                  <dt className="font-semibold">Base da decisão</dt>
                  <dd className="mt-0.5 text-muted-foreground">
                    {decision.evidence}
                  </dd>
                </div>
              )}
              {decision.result && (
                <div>
                  <dt className="font-semibold">Resultado registrado</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-muted-foreground">
                    {decision.result}
                  </dd>
                </div>
              )}
            </dl>
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
