import {
  DM_Serif_Display,
  Hanken_Grotesk,
  JetBrains_Mono,
  Source_Serif_4,
} from "next/font/google"

import "@workspace/ui/globals.css"

import { Toaster } from "@workspace/ui/components/sonner"
import { TooltipProvider } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import { HeaderGate } from "@/components/shell/header-gate"
import { SiteHeader } from "@/components/shell/site-header"
import { ThemeProvider } from "@/components/shell/theme-provider"

const fontBody = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-sans" })

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

const fontProse = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-prose",
  weight: ["400", "500", "600", "700"],
})

const fontDisplay = DM_Serif_Display({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400"],
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontBody.variable,
        fontProse.variable,
        fontDisplay.variable,
        jetbrainsMono.variable,
        "font-sans"
      )}
    >
      <body className="flex min-h-svh flex-col">
        <ThemeProvider>
          <TooltipProvider>
            <HeaderGate>
              <SiteHeader />
            </HeaderGate>
            {children}
            <Toaster richColors closeButton position="bottom-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
