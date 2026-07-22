import { getDungeonSnapshot } from "@/lib/db/queries/load-dungeon-snapshot"

/**
 * Public **dungeon fog-snapshot** endpoint at `/api/dungeon/{shortId}/snapshot`
 * (UNN-466). No auth — it serves the same signed-out-visible redacted snapshot the
 * fog view renders. The fog redaction is already baked into
 * {@link getDungeonSnapshot}, so this handler ships only what a player may see.
 * Returns 404 when the `shortId` matches no dungeon.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shortId: string }> }
) {
  const { shortId } = await params
  const snapshot = await getDungeonSnapshot(shortId)

  if (!snapshot) {
    return Response.json({ error: "Dungeon not found" }, { status: 404 })
  }

  return Response.json(snapshot)
}
