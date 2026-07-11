"use client"

import Link from "next/link"
import { useEffect } from "react"

import { Button } from "@workspace/ui/components/button"

/**
 * The shared fallback every route `error.tsx` renders (UNN-379). Next's error
 * boundaries are the backstop for a render/data throw that escaped the write
 * transitions' own toast path — a rejected loader, an unexpected render error —
 * so instead of Next's default full-blank error the surface shows a calm
 * "something went wrong" panel with `reset()` (re-renders the segment) and a way
 * home. `error.digest` is Next's server-side correlation id; we log the error
 * client-side so it reaches the console in every environment.
 */
export function RouteError({
  error,
  reset,
  title = "Something went wrong",
  description = "An unexpected error interrupted this page. It's usually temporary — try again.",
}: {
  error: Error & { digest?: string }
  reset: () => void
  title?: string
  description?: string
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-medium">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/" />}
        >
          Go home
        </Button>
      </div>
    </main>
  )
}
