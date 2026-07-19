"use server"

import {
  applyStaticReveal,
  seedMintedUniqueKeys,
  sproutStartStubs,
  withAuthoredProvenance,
} from "@workspace/game-v2/generation"
import {
  mapInstanceFromGeometry,
  type GenerationLedger,
} from "@workspace/game-v2/spatial"
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
import { loadTemplateSetRowById } from "@/lib/db/queries/load-template-set"
import {
  activateDungeonWithState,
  lockDungeonRowForLifecycle,
  mapActivationRaceToActiveDelve,
} from "@/lib/db/writes/dungeon"
import { guardMany } from "@/lib/db/writes/guard-many"
import {
  loadMapInstanceForWriteLocked,
  saveLockedMapInstanceState,
} from "@/lib/db/writes/map-instance"
import { publishDungeonPing } from "@/lib/realtime/publish"

import {
  StartExpeditionSchema,
  type StartExpeditionError,
  type StartExpeditionInput,
} from "./expedition-start.schema"
import { placeRoster } from "./place-roster"
import { revalidateDungeon } from "./revalidate"

/**
 * The **expedition-start** gesture (UNN-589 D5; generation slices UNN-590) —
 * the delve-start sibling for Region expeditions, `startDelveAction`-shaped
 * with the D5 pipeline in order:
 *
 * 1. snapshot the **live** seed Map (`mapInstanceFromGeometry` — always the
 *    Region's current `seedMapId` geometry, so authored edits arrive every
 *    expedition automatically),
 * 2. stamp every snapshotted Zone `authored` **with its depth**
 *    (`withAuthoredProvenance` — multi-source BFS from the placements' Zones;
 *    a split start is legal, so depths read the placement *input*, never
 *    occupancy),
 * 3. re-apply the Region's `staticReveal[seedMapId]` (`applyStaticReveal` — the
 *    escrowed chart from prior expeditions; ids the author has since deleted
 *    filter silently),
 * 4. seed the draw ledger from authored geometry (`seedMintedUniqueKeys` — the
 *    ledger law's delve-start case: an authored Castle Entrance can never
 *    coexist with a rolled one) under a freshly minted expedition seed,
 * 5. cull optional exits + sprout stubs on bound authored Zones
 *    (`sproutStartStubs`, deterministic off the seed; authored connections
 *    consume the exit budget first),
 * 6. place the roster (union-based {@link placeRoster} — it must not wipe the
 *    applied chart), and flip `draft → active` **with the initial ledger** in
 *    one guarded write ({@link activateDungeonWithState}).
 *
 * Concurrency (D11), identical to delve-start: friendly reads at the boundary,
 * the transaction re-establishes them behind the dungeon-row lifecycle lock,
 * the one-active rule is DB-enforced (`mapActivationRaceToActiveDelve` maps the
 * index loss), and start additionally refuses under a live encounter on this
 * instance — a fight can't straddle a snapshot that replaces the board.
 * (Ticked-site draws arrive P4; `rollContentsAtStart` execution and D9's
 * lint-error refusal arrive P5.)
 */
export async function startExpeditionAction(
  input: StartExpeditionInput
): Promise<
  Result<{ version: number; instanceVersion: number }, StartExpeditionError>
> {
  const parsed = StartExpeditionSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { dungeonId, expectedVersion, placements } = parsed.data

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
  // alive. Snapshot → authored stamp (with depths) → chart apply → ledger seed
  // → stub sprout → roster.
  const map = await loadMapRowById(region.seedMapId)
  if (map === null) return err("map-not-found")

  const templateSet = await loadTemplateSetRowById(region.templateSetId)
  if (templateSet === null) return err("template-set-not-found")

  const seed = crypto.randomUUID()
  const snapshot = applyStaticReveal(
    withAuthoredProvenance(
      mapInstanceFromGeometry(map.geometry),
      placements.map((placement) => placement.zoneId)
    ),
    region.seedMapId,
    region.staticReveal
  )
  const { stubs, cursors } = sproutStartStubs({
    state: snapshot,
    set: templateSet.content,
    startingZoneIds: placements.map((placement) => placement.zoneId),
    seed,
    newId: () => crypto.randomUUID(),
  })
  const next = placeRoster(
    { ...snapshot, generation: { ...snapshot.generation, stubs } },
    placements
  )
  const ledger: GenerationLedger = {
    seed,
    streamCursors: cursors,
    declarations: [],
    mintedUniqueKeys: seedMintedUniqueKeys(
      snapshot.geometry,
      templateSet.content
    ),
    mints: {},
  }

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

      const currentInstance = await loadMapInstanceForWriteLocked(
        tx,
        dungeon.mapInstanceId
      )
      if (!currentInstance.ok) return currentInstance
      const inst = await saveLockedMapInstanceState(
        tx,
        currentInstance.value,
        next
      )
      if (!inst.ok) return inst
      // One guarded bump flips the status AND persists the initial ledger —
      // two back-to-back bumps couldn't both condition on `expectedVersion`.
      const flipped = await activateDungeonWithState(
        tx,
        dungeon.id,
        { ...locked.value.state, generation: ledger },
        expectedVersion
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
