import { match } from "@workspace/result"

import { getEncounterSnapshot } from "@/lib/db/queries/load-encounter-snapshot"

/**
 * Public **player-snapshot** endpoint at `/api/encounter/{shortId}/snapshot`
 * (UNN-323 → UNN-535 on v2). No auth *guard* — the route is signed-out-visible
 * — but the query derives the viewer from the request session, so an owner's
 * request keeps their own components while a spectator's is fully redacted
 * (structurally dropped, never nulled). It is the plain-async seam the RSC page
 * and structural redaction tests share. Ships the complete redacted canon,
 * including every observed axis. Returns 404 when the `shortId` matches no
 * encounter; a data-integrity arm is a 500.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shortId: string }> }
) {
  const { shortId } = await params
  const result = await getEncounterSnapshot(shortId)

  return match(result, {
    ok: (value) => Response.json(value),
    err: (error) =>
      error === "encounter-not-found"
        ? Response.json({ error: "Encounter not found" }, { status: 404 })
        : Response.json({ error }, { status: 500 }),
  })
}
