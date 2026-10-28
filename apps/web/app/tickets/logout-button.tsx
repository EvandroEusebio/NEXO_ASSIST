"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"

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
    <div className="text-right">
      <Button
        variant="outline"
        onClick={logout}
        disabled={pending}
        className="rounded-md border border-[#e6e8ec] px-4 py-2 text-sm font-medium hover:bg-[#f6f7f9] disabled:opacity-60"
      >
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
