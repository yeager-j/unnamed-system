"use client"

import { RouteError } from "@/app/_components/route-error"

/**
 * Error backstop for the mapless encounter (setup, live console, watch) —
 * UNN-379. A throw shows the retry panel instead of blanking the combat surface
 * mid-session.
 */
export default function EncounterError({
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
      title="Couldn't load this encounter"
      description="Something went wrong. It's usually temporary — try again."
    />
  )
}
