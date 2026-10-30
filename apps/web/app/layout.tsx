import { ApplicationPresence } from "@/components/application-presence"
import { Geist, Geist_Mono } from "next/font/google"

import "@workspace/ui/globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@workspace/ui/lib/utils"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "NEXO ASSIST",
  description: "Atendimento de TI da Nexo",
}

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="pt"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        geist.variable
      )}
    >
      <body>
        <ThemeProvider forcedTheme="light">
          <ApplicationPresence />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
