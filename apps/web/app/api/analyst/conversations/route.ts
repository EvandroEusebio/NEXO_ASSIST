import { analysts, analystResponse } from "@/lib/analyst"
export const runtime = "nodejs"
export function GET(request: Request) {
  return analystResponse(request, (id) => analysts().list(id))
}
