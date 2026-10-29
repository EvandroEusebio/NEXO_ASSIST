"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { LogOut } from "lucide-react"

export function LogoutButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function logout() {
    setPending(true)
    setError("")
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" })
      if (!response.ok) throw new Error("Logout failed")
      router.replace("/login")
      router.refresh()
    } catch {
      setError("Não foi possível terminar a sessão.")
      setPending(false)
    }
  }

  return (
    <div >
      <Button
        variant="ghost"
        onClick={logout}
        disabled={pending}
        className="py-2 text-sm font-medium disabled:opacity-60 cursor-pointer"
      >
        <LogOut size={16}/>
        {pending ? "A sair…" : "Sair"}
      </Button>
      {error && (
        <Alert variant="destructive" className="mt-2 text-left">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
