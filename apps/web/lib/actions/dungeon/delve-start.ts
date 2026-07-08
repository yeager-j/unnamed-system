"use server"

import {
  addOccupant,
  mapInstanceFromGeometry,
  type MapInstanceState,
} from "@workspace/game-v2/spatial"
import { err, ok, type Result } from "@workspace/game/foundation"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { type WriteExecutor } from "@/lib/db/client"
import {
  loadActiveDungeonForCampaign,
  loadDungeonRowById,
} from "@/lib/db/queries/load-dungeon"
import { loadMapRowById } from "@/lib/db/queries/load-map"
import { loadMapInstanceById } from "@/lib/db/queries/map-instance"
import { setDungeonStatus } from "@/lib/db/writes/dungeon"
import { guardMany } from "@/lib/db/writes/guard-many"
import { saveMapInstanceState } from "@/lib/db/writes/map-instance"
import { publishDungeonPing } from "@/lib/realtime/publish"

import {
  StartDelveSchema,
  type StartDelveError,
  type StartDelveInput,
} from "./delve-start.schema"
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
 * Auth + guards (read-then-act at the boundary, before the transaction): resolve
 * the campaign and `requireCampaignDM`; the delve must still be `draft`; and the
 * **one-active-delve-per-campaign** rule rejects start when another delve already
 * holds the active slot. Returns **both** bumped versions so the console advances
 * its dungeon and Instance optimistic refs precisely.
 */
export async function startDelveAction(
  input: StartDelveInput
): Promise<
  Result<{ version: number; instanceVersion: number }, StartDelveError>
> {
  const parsed = StartDelveSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { dungeonId, expectedVersion, expectedInstanceVersion, placements } =
    parsed.data

  const dungeon = await loadDungeonRowById(dungeonId)
  if (dungeon === null) return err("dungeon-not-found")
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

  const result = await guardMany<
    { version: number; instanceVersion: number },
    StartDelveError
  >(async (tx: WriteExecutor) => {
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

/**
 * Places each staged PC token onto the snapshotted geometry (keyed by
 * `characterId`) and reveals each starting Zone that exists in the geometry —
 * placement is the party's first "entry", the initial `move → reveal`. A
 * placement pointing at a Zone the geometry doesn't carry still places the token
 * (guides, doesn't block) but reveals nothing.
 *
 * **Security invariant (fog-redaction gate):** a real delve reveals ≥1 starting
 * Zone here, which is what {@link
 * import("@workspace/game-v2/spatial/reveal").isFogActive} keys off to fog-redact
 * the public encounter snapshot ({@link
 * import("@workspace/game-v2/visibility").projectSpatialEncounterSnapshot}).
 * The only way `revealedZoneIds` stays empty is a degenerate delve whose every
 * placement points off-geometry (no party token on a real Zone) — broken, not a
 * runnable fight. If an explicit delve marker ever lands on the Instance, prefer
 * gating the redaction on that structural signal instead of this emergent one.
 */
function placeRoster(
  base: MapInstanceState,
  placements: readonly { characterId: string; zoneId: string }[]
): MapInstanceState {
  let next = base
  const revealed: string[] = []
  for (const { characterId, zoneId } of placements) {
    next = addOccupant(next, characterId, {
      zoneId,
      engagement: { status: "free" },
    })
    if (
      next.geometry.zones[zoneId] !== undefined &&
      !revealed.includes(zoneId)
    ) {
      revealed.push(zoneId)
    }
  }
  return { ...next, reveal: { ...next.reveal, revealedZoneIds: revealed } }
}
