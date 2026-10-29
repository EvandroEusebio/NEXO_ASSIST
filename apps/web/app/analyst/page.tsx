import { redirect } from "next/navigation"
import { currentUser } from "@/lib/auth"
import { AnalystConsole } from "./console"
export default async function AnalystPage() {
  const user = await currentUser()
  if (!user) redirect("/login")
  if (user.role !== "ANALYST") redirect("/chat")
  return <AnalystConsole user={user} />
}
