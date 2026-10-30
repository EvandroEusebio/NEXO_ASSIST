import { analysts, analystResponse } from "@/lib/analyst"
export const runtime = "nodejs"
type Context = { params: Promise<{ id: string }> }
export function GET(request: Request, context: Context) {
  return analystResponse(request, async (id) =>
    analysts().detail(id, (await context.params).id)
  )
}
export function POST(request: Request, context: Context) {
  return analystResponse(request, async (id) => {
    const input = await request.json()
    const conversationId = (await context.params).id
    return input?.action === "start"
      ? analysts().start(id, conversationId, input)
      : analysts().act(id, conversationId, input)
  })
}
