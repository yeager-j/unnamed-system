"use server"

import { reduceDungeon } from "@workspace/game-v2/spatial"
import { err, ok, type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import {
  loadDungeonCampaignId,
  loadDungeonRowById,
} from "@/lib/db/queries/load-dungeon"
import { saveDungeonState } from "@/lib/db/writes/dungeon"
import { publishDungeonPing } from "@/lib/realtime/publish"

import {
  ApplyDungeonEventSchema,
  type ApplyDungeonEventError,
  type ApplyDungeonEventInput,
} from "./events.schema"
import { revalidateDungeon } from "./revalidate"

/**
 * The impure shell that drives the dungeon run console (ADR — *Reducer topology*,
 * *Temporal layers invoke spatial transitions*): it applies one event to a delve
 * and saves the result, version-guarded. The wire event is a union of the turn
 * loop {@link import("@workspace/game-v2/spatial").DungeonEvent} and the spatial
 * {@link MapInstanceEvent}; this action **routes on** {@link isDungeonEvent} to
 * the right reducer + row, the exploration-time peer of `applyCombatEvent`.
 *
 * Flow: parse → authorize against the owning campaign **before** any state load
 * (`requireCampaignDM` trips `forbidden()` for a non-DM) → branch:
 *
 * - **Turn-loop event** (`markActed`/`advanceTurn`) → `reduceDungeon`, single-row
 *   `saveDungeonState` guarded on `expectedVersion`. Returns the dungeon version.
 * Spatial events are intentionally absent: they travel through the Map
 * Instance Replica.
 *
 * Each branch fires a `dungeon`-channel ping (UNN-468) — a `dungeon`-kind ping
 * for the turn-loop row, a `mapInstance`-kind ping for the spatial row — so the
 * fog view refreshes over realtime (polling stays the degraded fallback). The two
 * atomic cross-container gestures — delve-start and search-that-reveals — live in
 * their own actions (`delve-start.ts`, `search-reveal.ts`), not here; every move
 * and reveal is single-row.
 */
export async function applyDungeonEvent(
  input: ApplyDungeonEventInput
): Promise<Result<{ version: number }, ApplyDungeonEventError>> {
  const parsed = ApplyDungeonEventSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { dungeonId, expectedVersion, event } = parsed.data

  const campaignId = await loadDungeonCampaignId(dungeonId)
  if (campaignId === null) return err("dungeon-not-found")
  await requireCampaignDM(campaignId)

  const dungeon = await loadDungeonRowById(dungeonId)
  if (dungeon === null) return err("dungeon-not-found")

  // D11 (UNN-589): the event vocabulary writes only running delves — a draft or
  // done dungeon's rows are immutable through it (frozen history is structural,
  // not assumed). This plain read alone can't beat a racing finish; the race is
  // closed by finish's instance freeze — whichever write commits second fails
  // its version guard, and the retry re-reads the status here and refuses.
  if (dungeon.status !== "active") return err("delve-not-active")

  const next = reduceDungeon(dungeon.state, event)
  const saved = await saveDungeonState(dungeonId, next, expectedVersion)
  if (!saved.ok) return saved

  publishDungeonPing(dungeon.shortId, {
    version: saved.value.version,
    status: dungeon.status,
  })
  revalidateDungeon(dungeon)
  return ok({ version: saved.value.version })
}
