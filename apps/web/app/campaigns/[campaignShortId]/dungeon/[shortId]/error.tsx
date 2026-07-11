"use client"

import { RouteError } from "@/app/_components/route-error"

/**
 * Error backstop for the dungeon delve (prep, explore console, combat, watch) —
 * UNN-379. A throw shows the retry panel instead of blanking the delve
 * mid-session.
 */
export default function DungeonError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <RouteError
      error={error}
      reset={reset}
      title="Couldn't load this delve"
      description="Something went wrong. It's usually temporary — try again."
    />
  )
}
