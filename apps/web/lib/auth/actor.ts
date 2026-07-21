import { unauthorized } from "next/navigation"

import { auth } from "./index"

/**
 * A trusted, authenticated actor — the signed-in user's id (and email), derived
 * from the server session and never from the wire. This is **authentication
 * only**; per-resource authorization (ownership, DM, restricted-Archetype) is a
 * separate decision made at the point that resource is touched. The `email`
 * feeds the viewer-identity restricted-Archetype gate (`hiddenArchetypeKeysFor`)
 * when contextual authorization runs inside a transactional handler (UNN-674),
 * so the gate no longer reaches for the session itself.
 */
export interface Actor {
  readonly userId: string
  readonly email: string | null
}

/**
 * Resolves the current {@link Actor} for a Server Action, or trips
 * `unauthorized()` (HTTP 401) when there is no session. The Headcanon door's
 * authentication half (UNN-673): it derives the actor scope that keys mutation
 * receipts, so one identity can never probe or replay another's.
 */
export async function requireActor(): Promise<Actor> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) unauthorized()

  return { userId, email: session?.user?.email ?? null }
}
