import { chatResponse, conversations } from "@/lib/chat"
export const runtime = "nodejs"
export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return chatResponse(request, async (employeeId) =>
    conversations().send(
      employeeId,
      (await context.params).id,
      await request.json()
    )
  )
}
