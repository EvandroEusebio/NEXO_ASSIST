import assert from "node:assert/strict"
import { classifyPriority } from "../src/services/ticket-rules"
import { businessCalendar, isOverdue, responseDueAt } from "../src/services/sla"

const cases = [
  ["INC", "TEAM_STOPPED", "SAME_DAY", "CRITICAL"],
  ["INC", "PERSON_BLOCKED", "ROUTINE", "HIGH"],
  ["INC", "WORKAROUND_AVAILABLE", "ROUTINE", "MEDIUM"],
  ["REQ", "ROUTINE_REQUEST", "ROUTINE", "LOW"],
  ["REQ", "ROUTINE_REQUEST", "SAME_DAY", "HIGH"],
] as const
for (const [type, impact, urgency, expected] of cases)
  assert.equal(classifyPriority({ type, impact, urgency }), expected)
assert.equal(
  classifyPriority({
    type: "REQ",
    impact: "TEAM_STOPPED",
    urgency: "SAME_DAY",
  }),
  null
)

const calendar = businessCalendar({
  SLA_TIME_ZONE: "America/Sao_Paulo",
  SLA_WORK_START_HOUR: "9",
  SLA_WORK_END_HOUR: "18",
  SLA_HOLIDAYS: "2026-10-27",
})
const friday = new Date("2026-10-23T20:00:30.000Z") // Friday 17:00:30 in São Paulo
assert.equal(
  responseDueAt("CRITICAL", friday, calendar).toISOString(),
  "2026-10-23T21:00:30.000Z"
)
assert.equal(
  responseDueAt("HIGH", friday, calendar).toISOString(),
  "2026-10-26T15:00:30.000Z"
)
assert.equal(
  responseDueAt("MEDIUM", friday, calendar).toISOString(),
  "2026-10-29T20:00:30.000Z"
)
assert.equal(
  responseDueAt("LOW", friday, calendar).toISOString(),
  "2026-11-02T20:00:30.000Z"
)
assert.equal(
  responseDueAt(
    "HIGH",
    new Date("2026-10-24T15:00:00.000Z"),
    calendar
  ).toISOString(),
  "2026-10-26T16:00:00.000Z"
)
const dstCalendar = businessCalendar({ SLA_TIME_ZONE: "America/New_York" })
assert.equal(
  responseDueAt(
    "HIGH",
    new Date("2026-10-30T21:00:00.000Z"),
    dstCalendar
  ).toISOString(),
  "2026-11-02T17:00:00.000Z"
)
assert.equal(
  isOverdue(
    { status: "OPEN", nextResponseDueAt: new Date("2026-10-28T00:00:00Z") },
    new Date("2026-10-29T00:00:00Z")
  ),
  true
)
assert.equal(
  isOverdue(
    { status: "RESOLVED", nextResponseDueAt: new Date("2026-10-28T00:00:00Z") },
    new Date("2026-10-29T00:00:00Z")
  ),
  false
)
console.log("Classificação, calendário útil, feriado e vencimento: OK")
