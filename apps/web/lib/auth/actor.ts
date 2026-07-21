import { unauthorized } from "next/navigation"

import { auth } from "./index"

/**
 * A trusted, authenticated actor — the signed-in user's id, derived from the
 * server session and never from the wire. This is **authentication only**;
 * per-resource authorization (ownership, DM) is a separate decision made at the
 * point that resource is touched.
 */
export interface Actor {
  readonly userId: string
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

  return { userId }
}
