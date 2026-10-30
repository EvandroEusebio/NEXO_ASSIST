import { Check, CheckCheck } from "lucide-react"
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"

export function PresenceAvatar({
  name,
  online,
  className = "",
}: {
  name: string
  online: boolean
  className?: string
}) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
  const colors = [
    "bg-[#dceafa] text-[#0064ce]",
    "bg-[#f8e5d1] text-[#995014]",
    "bg-[#e9e1fa] text-[#6740d6]",
    "bg-[#dcf0e7] text-[#16805a]",
  ]
  const color =
    colors[
      Array.from(name).reduce((n, c) => n + c.charCodeAt(0), 0) % colors.length
    ]
  return (
    <span
      className={`relative inline-flex shrink-0 ${className}`}
      aria-label={`${name}: ${online ? "online" : "offline"}`}
    >
      <Avatar className="size-11">
        <AvatarFallback className={`${color} text-sm font-semibold`}>
          {initials}
        </AvatarFallback>
      </Avatar>
      {online && (
        <span className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-white bg-[#00bd78]" />
      )}
    </span>
  )
}
export function UnreadBadge({ count }: { count: number }) {
  if (!count) return null
  return (
    <span
      aria-label={`${count} mensagens não lidas`}
      className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-[#0064ce] px-1.5 py-0.5 text-[10px] leading-4 font-semibold text-white"
    >
      {count > 99 ? "99+" : count}
    </span>
  )
}
export function MessageReceipt({ read }: { read: boolean }) {
  const Icon = read ? CheckCheck : Check
  return (
    <span
      title={read ? "Lida" : "Enviada"}
      aria-label={read ? "Mensagem lida" : "Mensagem enviada"}
    >
      <Icon
        className={`size-3.5 ${read ? "text-[#0085ff]" : "text-slate-400"}`}
      />
    </span>
  )
}
export function TypingIndicator({ name }: { name?: string }) {
  return (
    <span role="status" className="text-xs text-[#00804a] italic">
      {name ? `${name} está digitando…` : "digitando…"}
    </span>
  )
}
