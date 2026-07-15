import { getEncounterSnapshot } from "@/lib/db/queries/load-encounter-snapshot"

/**
 * Public **player-snapshot** endpoint at `/api/encounter/{shortId}/snapshot`
 * (UNN-323 → UNN-535 on v2). No auth *guard* — the route is signed-out-visible
 * — but the query derives the viewer from the request session, so an owner's
 * poll keeps their own components while a spectator's is fully redacted
 * (structurally dropped, never nulled). It is the plain-async seam the RSC page
 * (initial render) and the `useEncounterSnapshot` hook (subsequent polls)
 * share. Ships `{ snapshot, compositeVersion }` — the composite version is the
 * equality token the client compares to skip no-op applies and to catch
 * durable `vitalsVersion` bumps the two numeric tokens can't see. Returns 404
 * when the `shortId` matches no encounter; a data-integrity arm is a 500.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shortId: string }> }
) {
  const { shortId } = await params
  const result = await getEncounterSnapshot(shortId)

  if (!result.ok) {
    if (result.error === "encounter-not-found") {
      return Response.json({ error: "Encounter not found" }, { status: 404 })
    }
    return Response.json({ error: result.error }, { status: 500 })
  }

  return Response.json(result.value)
}
