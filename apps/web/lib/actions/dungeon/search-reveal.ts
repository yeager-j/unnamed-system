"use server"

import {
  reduceMapInstance as createReduceMapInstance,
  reduceDungeon,
} from "@workspace/game-v2/spatial"
import { err, ok, type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { type WriteExecutor } from "@/lib/db/client"
import { loadDungeonRowById } from "@/lib/db/queries/load-dungeon"
import { saveDungeonState } from "@/lib/db/writes/dungeon"
import { guardMany } from "@/lib/db/writes/guard-many"
import {
  loadMapInstanceForWriteLocked,
  saveLockedMapInstanceState,
} from "@/lib/db/writes/map-instance"
import { publishDungeonPing } from "@/lib/realtime/publish"

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

  const { dungeonId, expectedVersion, characterId, event } = parsed.data

  const dungeon = await loadDungeonRowById(dungeonId)
  if (dungeon === null) return err("dungeon-not-found")
  await requireCampaignDM(dungeon.campaignId)

  // D11 (UNN-589): searches write only running delves — same status seal (and
  // the same finish-freeze closure of the read's race window) as the event path.
  if (dungeon.status !== "active") return err("delve-not-active")

  const nextDungeon = reduceDungeon(dungeon.state, {
    kind: "markActed",
    characterId,
  })
  const result = await guardMany<
    { version: number; instanceVersion: number },
    SearchRevealError
  >(async (tx: WriteExecutor) => {
    const instance = await loadMapInstanceForWriteLocked(
      tx,
      dungeon.mapInstanceId
    )
    if (!instance.ok) return instance
    const nextInstance = createReduceMapInstance(newId)(
      instance.value.state,
      event
    )
    const dng = await saveDungeonState(
      dungeon.id,
      nextDungeon,
      expectedVersion,
      tx
    )
    if (!dng.ok) return dng
    const inst = await saveLockedMapInstanceState(
      tx,
      instance.value,
      nextInstance
    )
    if (!inst.ok) return inst
    return ok({
      version: dng.value.version,
      instanceVersion: inst.value.version,
    })
  })
  if (!result.ok) return result

  // The dungeon row bumped (acted-flag) alongside the Instance reveal; pinging
  // the dungeon version triggers the fog view's refetch, which carries the reveal.
  publishDungeonPing(dungeon.shortId, {
    version: result.value.version,
    status: dungeon.status,
  })
  revalidateDungeon(dungeon)
  return ok(result.value)
}

const newId = () => crypto.randomUUID()
