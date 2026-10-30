type Assignment = { status: string; assignedAnalystId: string | null }

export function canReadAnalystMessages(
  conversation: Assignment,
  analystId: string
) {
  return (
    conversation.assignedAnalystId === analystId &&
    (conversation.status === "ANALYST_ACTIVE" ||
      conversation.status === "CLOSED")
  )
}
