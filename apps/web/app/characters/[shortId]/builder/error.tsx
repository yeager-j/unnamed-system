"use client"

import { RouteError } from "@/app/_components/route-error"

/**
 * Error backstop for the character builder (UNN-379). A throw here keeps the
 * player on a retry panel rather than losing the wizard to a blank error page.
 */
export default function BuilderError({
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
      title="Couldn't load the builder"
      description="Something went wrong. Your saved progress is safe — try again."
    />
  )
}
