"use client"

import { RouteError } from "@/app/_components/route-error"

/**
 * Error backstop for the character sheet + atlas (UNN-379). A failed sheet
 * load or a render throw shows the retry panel instead of blanking the sheet.
 */
export default function CharacterError({
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
      title="Couldn't load this character"
      description="Something went wrong loading the sheet. It's usually temporary — try again."
    />
  )
}
