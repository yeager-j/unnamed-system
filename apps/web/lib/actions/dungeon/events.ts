"use server"

import { reduceDungeon } from "@workspace/game/engine"
import {
  err,
  isDungeonEvent,
  ok,
  type MapInstanceEvent,
  type Result,
} from "@workspace/game/foundation"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { db } from "@/lib/db/client"
import {
  loadDungeonCampaignId,
  loadDungeonRowById,
} from "@/lib/db/queries/load-dungeon"
import { loadMapInstanceById } from "@/lib/db/queries/map-instance"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import { saveDungeonState } from "@/lib/db/writes/dungeon"
import { saveMapInstanceState } from "@/lib/db/writes/map-instance"
import { reduceMapInstance } from "@/lib/game-engine"
import {
  publishDungeonInstancePing,
  publishDungeonPing,
} from "@/lib/realtime/publish"

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
 * loop {@link import("@workspace/game/foundation").DungeonEvent} and the spatial
 * {@link MapInstanceEvent}; this action **routes on** `isDungeonEvent` to the
 * right reducer + row, the exploration-time peer of `applyCombatEvent`.
 *
 * Flow: parse → authorize against the owning campaign **before** any state load
 * (`requireCampaignDM` trips `forbidden()` for a non-DM) → branch:
 *
 * - **Turn-loop event** (`markActed`/`advanceTurn`) → `reduceDungeon`, single-row
 *   `saveDungeonState` guarded on `expectedVersion`. Returns the dungeon version.
 * - **Spatial event** (free-drag `moveCombatant`, reveal/hide/unlock) →
 *   {@link applySpatialEvent}: load the delve's Instance, `reduceMapInstance`,
 *   single-row `saveMapInstanceState` guarded on `expectedInstanceVersion`,
 *   returning the **Instance** version.
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

  const { dungeonId, expectedVersion, expectedInstanceVersion, event } =
    parsed.data

  const campaignId = await loadDungeonCampaignId(dungeonId)
  if (campaignId === null) return err("dungeon-not-found")
  await requireCampaignDM(campaignId)

  const dungeon = await loadDungeonRowById(dungeonId)
  if (dungeon === null) return err("dungeon-not-found")

  if (isDungeonEvent(event)) {
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

  return applySpatialEvent(dungeon, expectedInstanceVersion, event)
}

/**
 * A pure spatial write on the delve's Map Instance: load it, reduce, save the
 * single Instance row guarded on `expectedInstanceVersion`, and fire a
 * `mapInstance`-kind ping (UNN-468) so the fog view picks up the move/reveal over
 * realtime. Returns the bumped **Instance** version (the token the
 * instance-mirroring console advances). In exploration the DM free-drags, so this
 * is the only movement path; once a fight is live, occupancy is written through
 * the Encounter's model (M4), not here.
 */
async function applySpatialEvent(
  dungeon: DungeonRow,
  expectedInstanceVersion: number | undefined,
  event: MapInstanceEvent
): Promise<Result<{ version: number }, ApplyDungeonEventError>> {
  if (expectedInstanceVersion === undefined) {
    return err("missing-instance-version")
  }

  const instance = await loadMapInstanceById(dungeon.mapInstanceId)
  if (instance === null) return err("map-instance-not-found")

  const next = reduceMapInstance(instance.state, event)
  const saved = await saveMapInstanceState(
    db,
    dungeon.mapInstanceId,
    next,
    expectedInstanceVersion
  )
  if (!saved.ok) return saved

  publishDungeonInstancePing(dungeon.shortId, saved.value.version)
  revalidateDungeon(dungeon)
  return ok({ version: saved.value.version })
}
