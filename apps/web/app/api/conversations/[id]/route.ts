import { chatResponse, conversations } from "@/lib/chat"
export const runtime = "nodejs"
export function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return chatResponse(request, async (employeeId) =>
    conversations().snapshot(employeeId, (await context.params).id)
  )
}
