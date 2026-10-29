import type { createAnalystService } from "../services/analyst"
type JsonDates<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? JsonDates<U>[]
    : T extends object
      ? { [K in keyof T]: JsonDates<T[K]> }
      : T
type Service = ReturnType<typeof createAnalystService>
export type AnalystConversation = JsonDates<
  Awaited<ReturnType<Service["list"]>>[number]
>
export type AnalystDetail = JsonDates<Awaited<ReturnType<Service["detail"]>>>
