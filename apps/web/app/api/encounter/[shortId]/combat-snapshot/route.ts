import { match } from "@workspace/result"

import { getDungeonCombatSnapshot } from "@/lib/db/queries/load-encounter-snapshot"

/**
 * Public **fogged** player-snapshot endpoint for a fight running on a delve
 * (UNN-536) — the poll source the dungeon combat watch subscribes to, the fog
 * twin of `/api/encounter/{shortId}/snapshot`. Same viewer-derived redaction, but
 * {@link getDungeonCombatSnapshot} additionally clamps zones/combatants to what
 * the DM has revealed, so a player watching a delve fight never sees past the fog.
 * Keyed by the **encounter** `shortId` (the watch's realtime channel + poll key).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shortId: string }> }
) {
  const { shortId } = await params
  const result = await getDungeonCombatSnapshot(shortId)

  return match(result, {
    ok: (value) => Response.json(value),
    err: (error) =>
      error === "encounter-not-found"
        ? Response.json({ error: "Encounter not found" }, { status: 404 })
        : Response.json({ error }, { status: 500 }),
  })
}
