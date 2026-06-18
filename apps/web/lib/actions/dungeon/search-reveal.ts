"use server"

import { reduceDungeon } from "@workspace/game/engine"
import { err, ok, type Result } from "@workspace/game/foundation"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { type WriteExecutor } from "@/lib/db/client"
import { loadDungeonRowById } from "@/lib/db/queries/load-dungeon"
import { loadMapInstanceById } from "@/lib/db/queries/map-instance"
import { saveDungeonState } from "@/lib/db/writes/dungeon"
import { guardMany } from "@/lib/db/writes/guard-many"
import { saveMapInstanceState } from "@/lib/db/writes/map-instance"
import { reduceMapInstance } from "@/lib/game-engine"

import { revalidateDungeon } from "./revalidate"
import {
  SearchRevealSchema,
  type SearchRevealError,
  type SearchRevealInput,
} from "./search-reveal.schema"

/**
 * The **search-that-reveals** gesture (ADR — *Atomicity*; PRD FR-5): a character
 * Searches and the DM reveals what it uncovered, so the Dungeon `markActed`
 * acted-flag and the Instance reveal commit **atomically** in one {@link guardMany}
 * transaction — a partial failure leaves neither row changed (mirrors
 * `applyRosterCrossWrite`). A plain reveal that *isn't* a search is the single-row
 * {@link import("./events").applyDungeonEvent} spatial path; this action exists
 * only for the coupled case the confirm dialog offers.
 *
 * Returns **both** bumped versions so the console advances its dungeon and Instance
 * optimistic refs precisely.
 */
export async function searchRevealAction(
  input: SearchRevealInput
): Promise<
  Result<{ version: number; instanceVersion: number }, SearchRevealError>
> {
  const parsed = SearchRevealSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const {
    dungeonId,
    expectedVersion,
    expectedInstanceVersion,
    characterId,
    event,
  } = parsed.data

  const dungeon = await loadDungeonRowById(dungeonId)
  if (dungeon === null) return err("dungeon-not-found")
  await requireCampaignDM(dungeon.campaignId)

  const instance = await loadMapInstanceById(dungeon.mapInstanceId)
  if (instance === null) return err("map-instance-not-found")

  const nextDungeon = reduceDungeon(dungeon.state, {
    kind: "markActed",
    characterId,
  })
  const nextInstance = reduceMapInstance(instance.state, event)

  const result = await guardMany<
    { version: number; instanceVersion: number },
    SearchRevealError
  >(async (tx: WriteExecutor) => {
    const dng = await saveDungeonState(
      dungeon.id,
      nextDungeon,
      expectedVersion,
      tx
    )
    if (!dng.ok) return dng
    const inst = await saveMapInstanceState(
      tx,
      dungeon.mapInstanceId,
      nextInstance,
      expectedInstanceVersion
    )
    if (!inst.ok) return inst
    return ok({
      version: dng.value.version,
      instanceVersion: inst.value.version,
    })
  })
  if (!result.ok) return result

  revalidateDungeon(dungeon)
  return ok(result.value)
}
