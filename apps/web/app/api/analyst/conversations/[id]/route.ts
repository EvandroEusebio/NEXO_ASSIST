import { analysts, analystResponse } from "@/lib/analyst"
export const runtime = "nodejs"
type Context = { params: Promise<{ id: string }> }
export function GET(request: Request, context: Context) {
  return analystResponse(request, async (id) =>
    analysts().detail(id, (await context.params).id)
  )
}
export function POST(request: Request, context: Context) {
  return analystResponse(request, async (id) =>
    analysts().act(id, (await context.params).id, await request.json())
  )
}
