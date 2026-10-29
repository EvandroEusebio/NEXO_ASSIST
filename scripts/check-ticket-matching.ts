import assert from "node:assert/strict"
import {
  canReopen,
  problemMatchScore,
  REOPEN_WINDOW_MS,
} from "../src/services/ticket-matching"

const vpn = {
  title: "VPN erro 809",
  description: "A VPN falha com o código 809 no notebook.",
  type: "INC" as const,
  category: "NETWORK_VPN" as const,
}
assert.equal(problemMatchScore(vpn, { ...vpn, title: "VPN erro 809" }), 1)
assert.ok(
  problemMatchScore(vpn, {
    ...vpn,
    title: "VPN não conecta, erro 809",
    description: "Recebo 809 quando tento ligar a VPN.",
  }) > 0
)
assert.equal(
  problemMatchScore(vpn, {
    ...vpn,
    title: "Impressora sem papel",
    description: "Impressora indisponível na sala de reunião.",
  }),
  0
)
assert.equal(problemMatchScore(vpn, { ...vpn, category: "HARDWARE" }), 0)

const now = new Date("2026-10-29T12:00:00.000Z")
assert.equal(
  canReopen(
    {
      status: "RESOLVED",
      resolvedAt: new Date(now.getTime() - REOPEN_WINDOW_MS),
    },
    now
  ),
  true
)
assert.equal(
  canReopen(
    {
      status: "RESOLVED",
      resolvedAt: new Date(now.getTime() - REOPEN_WINDOW_MS - 1),
    },
    now
  ),
  false
)
assert.equal(canReopen({ status: "CLOSED", resolvedAt: now }, now), false)
assert.equal(canReopen({ status: "RESOLVED", resolvedAt: null }, now), false)
console.log("Duplicidade, isolamento por categoria e janela de 7 dias: OK")
