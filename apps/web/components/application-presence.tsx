"use client"

import { usePathname } from "next/navigation"
import { useRef } from "react"
import { useConversationActivity } from "@/hooks/use-conversation-activity"

function Presence() {
  const sentinel = useRef<HTMLDivElement>(null)
  useConversationActivity({
    conversationId: null,
    latestMessageId: undefined,
    canType: false,
    readSentinel: sentinel,
  })
  return null
}

/** Independent of conversation selection and preserved during authenticated navigation. */
export function ApplicationPresence() {
  const path = usePathname()
  return ["/chat", "/profile", "/tickets", "/analyst"].some(
    (route) => path === route || path.startsWith(route + "/")
  ) ? (
    <Presence />
  ) : null
}
