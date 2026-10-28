import { chatResponse, conversations } from "@/lib/chat"
export const runtime = "nodejs"
export function GET(request: Request) {
  return chatResponse(request, async (id) => ({
    conversations: await conversations().list(id),
  }))
}
export function POST(request: Request) {
  return chatResponse(request, async (id) =>
    conversations().create(id, await request.json())
  )
}
