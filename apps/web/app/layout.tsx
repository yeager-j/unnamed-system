import { Geist, JetBrains_Mono } from "next/font/google"

import "@workspace/ui/globals.css"

import { TooltipProvider } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import { SiteHeader } from "@/components/site-header"
import { ThemeProvider } from "@/components/theme-provider"

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

const jetbrainsMono = JetBrains_Mono({
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
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontSans.variable,
        "font-mono",
        jetbrainsMono.variable
      )}
    >
      <body className="flex min-h-svh flex-col">
        <ThemeProvider>
          <TooltipProvider>
            <SiteHeader />
            {children}
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
