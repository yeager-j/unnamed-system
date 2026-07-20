"use server"

import { mapInstanceFromGeometry } from "@workspace/game-v2/spatial"
import { err, ok, type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { type WriteExecutor } from "@/lib/db/client"
import {
  loadActiveDungeonForCampaign,
  loadDungeonVariantForWrite,
} from "@/lib/db/queries/load-dungeon"
import { loadMapRowById } from "@/lib/db/queries/load-map"
import { loadMapInstanceById } from "@/lib/db/queries/map-instance"
import {
  lockDungeonRowForLifecycle,
  mapActivationRaceToActiveDelve,
  setDungeonStatus,
} from "@/lib/db/writes/dungeon"
import { guardMany } from "@/lib/db/writes/guard-many"
import {
  loadMapInstanceForWriteLocked,
  saveLockedMapInstanceState,
} from "@/lib/db/writes/map-instance"
import { publishDungeonPing } from "@/lib/realtime/publish"

import {
  StartDelveSchema,
  type StartDelveError,
  type StartDelveInput,
} from "./delve-start.schema"
import { placeRoster } from "./place-roster"
import { revalidateDungeon } from "./revalidate"

/**
 * The **delve-start** gesture (ADR — *Atomicity*; PRD FR-3): snapshot the selected
 * Map's authored geometry into the dungeon's Map Instance (Decision 7 — the
 * Instance is born blank and snapshots at start, so My Maps edits between create
 * and run are picked up), place the party's staged PC tokens (keyed by
 * `characterId`), reveal their starting Zones, and flip the dungeon `draft →
 * active` — **atomically**, via one {@link guardMany} transaction (the Instance
 * geometry+tokens write and the dungeon status flip commit together or not at all;
 * mirrors `applyStartCombat`).
 *
 * Ordinary delves only: a Region **expedition** is refused here (UNN-589 D11's
 * variant sealing — `startExpeditionAction` owns that lifecycle; UI routing is
 * not an invariant).
 *
 * Concurrency (D11): the friendly status/one-active reads stay at the boundary
 * for error copy, but the transaction re-establishes them — it opens with the
 * dungeon-row lifecycle lock ({@link lockDungeonRowForLifecycle}, dungeon-first
 * per the lock-order discipline) and re-checks `draft` on the locked row, and
 * the one-active rule is DB-enforced by the `dungeon_one_active_per_campaign`
 * partial index (a fully-concurrent second activation loses at the index and
 * maps back to the same friendly error). Returns **both** bumped versions so the
 * console advances its dungeon and Instance optimistic refs precisely.
 */
export async function startDelveAction(
  input: StartDelveInput
): Promise<
  Result<{ version: number; instanceVersion: number }, StartDelveError>
> {
  const parsed = StartDelveSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { dungeonId, placements } = parsed.data

  const variant = await loadDungeonVariantForWrite(dungeonId)
  if (variant === null) return err("dungeon-not-found")
  if (variant.kind === "expedition") return err("delve-is-expedition")
  const dungeon = variant.row
  await requireCampaignDM(dungeon.campaignId)

  if (dungeon.status !== "draft") return err("delve-not-draft")

  const active = await loadActiveDungeonForCampaign(dungeon.campaignId)
  if (active && active.id !== dungeon.id) {
    return err("campaign-already-has-active-delve")
  }

  const instance = await loadMapInstanceById(dungeon.mapInstanceId)
  if (instance === null) return err("map-instance-not-found")
  if (instance.mapId === null) return err("map-not-found")

  const map = await loadMapRowById(instance.mapId)
  if (map === null) return err("map-not-found")

  const next = placeRoster(mapInstanceFromGeometry(map.geometry), placements)

  const result = await mapActivationRaceToActiveDelve(
    guardMany<{ version: number; instanceVersion: number }, StartDelveError>(
      async (tx: WriteExecutor) => {
        const locked = await lockDungeonRowForLifecycle(tx, dungeon.id)
        if (!locked.ok) return locked
        if (locked.value.status !== "draft") return err("delve-not-draft")

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
        const flipped = await setDungeonStatus(
          dungeon.id,
          "active",
          locked.value.version,
          tx
        )
        if (!flipped.ok) return flipped
        return ok({
          version: flipped.value.version,
          instanceVersion: inst.value.version,
        })
      }
    )
  )
  if (!result.ok) return result

  // The delve just went live (draft → active) — the dungeon ping's status flips
  // the fog view from its waiting state to the map, and its version bump triggers
  // the refetch that picks up the freshly-placed tokens + revealed Zones.
  publishDungeonPing(dungeon.shortId, {
    version: result.value.version,
    status: "active",
  })
  revalidateDungeon(dungeon)
  return ok(result.value)
}
