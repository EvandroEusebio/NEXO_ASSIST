export type ReadCursor = { at: string; messageId: string }
export type ConversationActivity = {
  employee: { online: boolean; typing: boolean }
  analyst: { online: boolean; typing: boolean }
  unreadCount: number
  employeeRead: ReadCursor | null
  analystRead: ReadCursor | null
}
export function wasRead(
  message: { id: string; createdAt: string },
  cursor: ReadCursor | null
) {
  if (!cursor) return false
  const time = new Date(message.createdAt).getTime()
  const read = new Date(cursor.at).getTime()
  return time < read || (time === read && message.id <= cursor.messageId)
}
