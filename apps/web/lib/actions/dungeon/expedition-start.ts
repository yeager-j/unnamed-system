"use server"

import {
  applyStaticReveal,
  withAuthoredProvenance,
} from "@workspace/game-v2/generation"
import { mapInstanceFromGeometry } from "@workspace/game-v2/spatial"
import { err, ok, type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { type WriteExecutor } from "@/lib/db/client"
import {
  loadActiveDungeonForCampaign,
  loadDungeonVariantForWrite,
} from "@/lib/db/queries/load-dungeon"
import { loadLiveEncounterForMapInstance } from "@/lib/db/queries/load-encounter-session"
import { loadMapRowById } from "@/lib/db/queries/load-map"
import { loadRegionRowById } from "@/lib/db/queries/load-region"
import {
  lockDungeonRowForLifecycle,
  mapActivationRaceToActiveDelve,
  setDungeonStatus,
} from "@/lib/db/writes/dungeon"
import { guardMany } from "@/lib/db/writes/guard-many"
import { saveMapInstanceState } from "@/lib/db/writes/map-instance"
import { publishDungeonPing } from "@/lib/realtime/publish"

import {
  StartExpeditionSchema,
  type StartExpeditionError,
  type StartExpeditionInput,
} from "./expedition-start.schema"
import { placeRoster } from "./place-roster"
import { revalidateDungeon } from "./revalidate"

/**
 * The **expedition-start** gesture (UNN-589 D5) — the delve-start sibling for
 * Region expeditions, `startDelveAction`-shaped with two additions in the pure
 * pipeline, in order:
 *
 * 1. snapshot the **live** seed Map (`mapInstanceFromGeometry` — always the
 *    Region's current `seedMapId` geometry, so authored edits arrive every
 *    expedition automatically),
 * 2. stamp every snapshotted Zone `authored` (`withAuthoredProvenance` — the
 *    provenance that later gates the finish-time fold),
 * 3. re-apply the Region's `staticReveal[seedMapId]` (`applyStaticReveal` — the
 *    escrowed chart from prior expeditions; ids the author has since deleted
 *    filter silently),
 * 4. place the roster (union-based {@link placeRoster} — it must not wipe the
 *    applied chart), and flip `draft → active`.
 *
 * Concurrency (D11), identical to delve-start: friendly reads at the boundary,
 * the transaction re-establishes them behind the dungeon-row lifecycle lock,
 * the one-active rule is DB-enforced (`mapActivationRaceToActiveDelve` maps the
 * index loss), and start additionally refuses under a live encounter on this
 * instance — a fight can't straddle a snapshot that replaces the board.
 * (Depths, ledger seeding, and stubs arrive P3; draws P4.)
 */
export async function startExpeditionAction(
  input: StartExpeditionInput
): Promise<
  Result<{ version: number; instanceVersion: number }, StartExpeditionError>
> {
  const parsed = StartExpeditionSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { dungeonId, expectedVersion, expectedInstanceVersion, placements } =
    parsed.data

  const variant = await loadDungeonVariantForWrite(dungeonId)
  if (variant === null) return err("dungeon-not-found")
  if (variant.kind === "delve") return err("not-an-expedition")
  const dungeon = variant.row
  await requireCampaignDM(dungeon.campaignId)

  if (dungeon.status !== "draft") return err("delve-not-draft")

  const active = await loadActiveDungeonForCampaign(dungeon.campaignId)
  if (active && active.id !== dungeon.id) {
    return err("campaign-already-has-active-delve")
  }

  const region = await loadRegionRowById(variant.regionId)
  if (region === null) return err("region-not-found")

  // The LIVE seed Map, deliberately not the Instance's recorded `mapId` — the
  // Region row is the designation's authority, and a restrict FK keeps the Map
  // alive. Snapshot → authored stamp → chart apply → roster.
  const map = await loadMapRowById(region.seedMapId)
  if (map === null) return err("map-not-found")

  const next = placeRoster(
    applyStaticReveal(
      withAuthoredProvenance(mapInstanceFromGeometry(map.geometry)),
      region.seedMapId,
      region.staticReveal
    ),
    placements
  )

  const result = await mapActivationRaceToActiveDelve(
    guardMany<
      { version: number; instanceVersion: number },
      StartExpeditionError
    >(async (tx: WriteExecutor) => {
      const locked = await lockDungeonRowForLifecycle(
        tx,
        dungeon.id,
        expectedVersion
      )
      if (!locked.ok) return locked
      if (locked.value.status !== "draft") return err("delve-not-draft")

      const live = await loadLiveEncounterForMapInstance(
        dungeon.mapInstanceId,
        tx
      )
      if (live !== null) return err("delve-has-live-encounter")

      const inst = await saveMapInstanceState(
        tx,
        dungeon.mapInstanceId,
        next,
        expectedInstanceVersion
      )
      if (!inst.ok) return inst
      const flipped = await setDungeonStatus(
        dungeon.id,
        "active",
        expectedVersion,
        tx
      )
      if (!flipped.ok) return flipped
      return ok({
        version: flipped.value.version,
        instanceVersion: inst.value.version,
      })
    })
  )
  if (!result.ok) return result

  publishDungeonPing(dungeon.shortId, {
    version: result.value.version,
    status: "active",
  })
  revalidateDungeon(dungeon)
  return ok(result.value)
}
