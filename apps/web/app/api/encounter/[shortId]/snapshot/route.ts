import { getEncounterSnapshot } from "@/lib/db/queries/load-encounter-snapshot"

/**
 * Public **player-snapshot** endpoint at `/api/encounter/{shortId}/snapshot`
 * (UNN-323). No auth — it serves the same signed-out-visible redacted snapshot
 * the watch page renders, so a player's poll can read it. It is the plain-async
 * seam the RSC page (initial render) and the `useEncounterSnapshot` hook
 * (subsequent ~1.5s polls) share; the enemy-affinity redaction is already baked
 * into {@link getEncounterSnapshot}, so this handler ships only what a player may
 * see. Returns 404 when the `shortId` matches no encounter.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shortId: string }> }
) {
  const { shortId } = await params
  const snapshot = await getEncounterSnapshot(shortId)

  if (!snapshot) {
    return Response.json({ error: "Encounter not found" }, { status: 404 })
  }

  return Response.json(snapshot)
}
