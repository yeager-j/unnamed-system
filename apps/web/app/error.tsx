"use client"

import { RouteError } from "@/app/_components/route-error"

/**
 * The app-wide error backstop (UNN-379) for every route without a closer
 * `error.tsx` — My Characters, campaigns, maps, join. Nested inside the root
 * layout, so the site header persists; a layout-level crash falls through to
 * `global-error.tsx`.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <RouteError error={error} reset={reset} />
}
