import { redirect } from "next/navigation"
import { currentEmployee } from "@/lib/auth"
import { conversations } from "@/lib/chat"
import { Chat } from "./chat"
import type {
  ChatSnapshot,
  ConversationSummary,
} from "../../../../src/contracts/chat"
export default async function ChatPage() {
  const user = await currentEmployee()
  if (!user) redirect("/login")
  const history = await conversations().list(user.id)
  const snapshot = history[0]
    ? await conversations().snapshot(user.id, history[0].id)
    : null
  return (
    <Chat
      user={user}
      initial={JSON.parse(JSON.stringify(snapshot)) as ChatSnapshot | null}
      initialHistory={
        JSON.parse(JSON.stringify(history)) as ConversationSummary[]
      }
    />
  )
}
