import { redirect } from "next/navigation"
import { currentEmployee } from "@/lib/auth"

export default async function Home() {
  const user = await currentEmployee()
  redirect(user ? "/chat" : "/login")
}
