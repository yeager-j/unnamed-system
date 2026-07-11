"use client"

import "@workspace/ui/globals.css"

import { RouteError } from "@/app/_components/route-error"

/**
 * The root backstop (UNN-379) for a crash in the **root layout itself**, which
 * the segment `error.tsx` boundaries can't catch. It replaces the whole
 * document, so it renders its own `<html>`/`<body>` and re-imports the global
 * stylesheet (the layout that normally provides it is what failed). The app is
 * dark-only (the "mystical theater" brand), so the shell is stamped `dark`.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en" className="dark">
      <body className="flex min-h-svh flex-col bg-background text-foreground antialiased">
        <RouteError error={error} reset={reset} />
      </body>
    </html>
  )
}
