import { cookies } from "next/headers"
import { authService, SESSION_COOKIE_NAME } from "@/lib/auth"
import { chatResponse, conversations } from "@/lib/chat"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const id = (await context.params).id
  // Validate ownership before committing streaming headers.
  const checked = await chatResponse(request, (employeeId) =>
    conversations().snapshot(employeeId, id)
  )
  if (!checked.ok) return checked
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value
  const encoder = new TextEncoder()
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  const stream = new ReadableStream({
    start(controller) {
      let previous = ""
      const started = Date.now()
      const stop = () => {
        if (stopped) return
        stopped = true
        clearTimeout(timer)
        controller.close()
        request.signal.removeEventListener("abort", stop)
      }
      request.signal.addEventListener("abort", stop, { once: true })
      async function pump() {
        try {
          if (stopped) return
          const user = await authService().currentUser(token)
          if (!user) {
            if (!stopped)
              controller.enqueue(
                encoder.encode("event: session-expired\ndata: {}\n\n")
              )
            stop()
            return
          }
          const data = JSON.stringify(
            await conversations().snapshot(user.id, id)
          )
          if (stopped) return
          if (data !== previous) {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`))
            previous = data
          } else controller.enqueue(encoder.encode(": heartbeat\n\n"))
          if (Date.now() - started > 50000) {
            stop()
            return
          }
          timer = setTimeout(pump, 2000)
        } catch {
          stop()
        }
      }
      void pump()
    },
    cancel() {
      stopped = true
      clearTimeout(timer)
    },
  })
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  })
}
