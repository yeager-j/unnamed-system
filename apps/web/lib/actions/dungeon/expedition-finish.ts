"use server"

import { revalidatePath } from "next/cache"

import { foldExpedition } from "@workspace/game-v2/generation"
import { err, ok, type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { type WriteExecutor } from "@/lib/db/client"
import { loadDungeonVariantForWrite } from "@/lib/db/queries/load-dungeon"
import { loadLiveEncounterForMapInstance } from "@/lib/db/queries/load-encounter-session"
import { loadRegionRowById } from "@/lib/db/queries/load-region"
import {
  lockDungeonRowForLifecycle,
  setDungeonStatus,
} from "@/lib/db/writes/dungeon"
import { guardMany } from "@/lib/db/writes/guard-many"
import {
  loadMapInstanceForWriteLocked,
  saveLockedMapInstanceState,
} from "@/lib/db/writes/map-instance"
import { foldRegionStaticReveal } from "@/lib/db/writes/region"
import { campaignRegionPath } from "@/lib/paths"
import {
  publishDungeonInstancePing,
  publishDungeonPing,
} from "@/lib/realtime/publish"

import {
  FinishExpeditionSchema,
  type FinishExpeditionError,
  type FinishExpeditionInput,
} from "./expedition-finish.schema"
import { revalidateDungeon } from "./revalidate"

/**
 * The **expedition-finish** gesture (UNN-589 D5/D11) — not a bare status flip:
 * status → `done` **plus the knowledge fold**, one {@link guardMany} over
 * dungeon + instance + region, in the lifecycle lock order:
 *
 * 1. {@link lockDungeonRowForLifecycle} — the serialization point; must still
 *    be `active` on the locked row.
 * 2. Lock the current Instance and refuse if it is already frozen.
 * 3. Refuse under a live encounter on this Instance (in-tx read; fully
 *    serialized, because combat start also takes the dungeon lock).
 * 4. Freeze the locked Instance. Any later Replica delivery sees `frozen` and
 *    refuses, making terminal history structural.
 * 5. `foldExpedition` (pure, game-v2 `generation/fold.ts` — the escrow module's
 *    write half) → {@link foldRegionStaticReveal} guarded on the region version
 *    read inside this transaction (the client never holds a region token).
 * 6. `setDungeonStatus("done")`.
 *
 * (The `discoveredSiteKeys` fold joins in P4.) Pings **both** rows — the
 * instance version moved (the freeze), and a watch subscriber keyed on it must
 * not be left behind the truth — and revalidates the console, campaign
 * overview, and the Region detail whose history + chart just changed.
 */
export async function finishExpeditionAction(
  input: FinishExpeditionInput
): Promise<
  Result<{ version: number; instanceVersion: number }, FinishExpeditionError>
> {
  const parsed = FinishExpeditionSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { dungeonId, expectedVersion } = parsed.data

  const variant = await loadDungeonVariantForWrite(dungeonId)
  if (variant === null) return err("dungeon-not-found")
  if (variant.kind === "delve") return err("not-an-expedition")
  const dungeon = variant.row
  const campaign = await requireCampaignDM(dungeon.campaignId)

  // Friendly pre-checks (error copy); the transaction re-establishes both.
  if (dungeon.status !== "active") return err("delve-not-active")
  const liveOutside = await loadLiveEncounterForMapInstance(
    dungeon.mapInstanceId
  )
  if (liveOutside !== null) return err("delve-has-live-encounter")

  const result = await guardMany<
    { version: number; instanceVersion: number; regionShortId: string },
    FinishExpeditionError
  >(async (tx: WriteExecutor) => {
    const locked = await lockDungeonRowForLifecycle(
      tx,
      dungeonId,
      expectedVersion
    )
    if (!locked.ok) return locked
    if (locked.value.status !== "active") return err("delve-not-active")

    const instance = await loadMapInstanceForWriteLocked(
      tx,
      dungeon.mapInstanceId
    )
    if (!instance.ok) return instance

    const live = await loadLiveEncounterForMapInstance(
      dungeon.mapInstanceId,
      tx
    )
    if (live !== null) return err("delve-has-live-encounter")

    const frozen = await saveLockedMapInstanceState(
      tx,
      instance.value,
      instance.value.state,
      { freeze: true }
    )
    if (!frozen.ok) return frozen

    const region = await loadRegionRowById(variant.regionId, tx)
    if (region === null) return err("region-not-found")

    const folded = foldExpedition({
      instance: instance.value.state,
      seedMapId: region.seedMapId,
      prior: region.staticReveal,
    })
    const regionSaved = await foldRegionStaticReveal(
      tx,
      region.id,
      region.version,
      folded
    )
    if (!regionSaved.ok) return regionSaved

    const flipped = await setDungeonStatus(
      dungeonId,
      "done",
      expectedVersion,
      tx
    )
    if (!flipped.ok) return flipped

    return ok({
      version: flipped.value.version,
      instanceVersion: frozen.value.version,
      regionShortId: region.shortId,
    })
  })
  if (!result.ok) return result

  publishDungeonPing(dungeon.shortId, {
    version: result.value.version,
    status: "done",
  })
  publishDungeonInstancePing(dungeon.shortId, result.value.instanceVersion)
  revalidatePath(`/campaigns/${campaign.shortId}`)
  revalidatePath(
    campaignRegionPath(campaign.shortId, result.value.regionShortId)
  )
  revalidateDungeon(dungeon)
  return ok({
    version: result.value.version,
    instanceVersion: result.value.instanceVersion,
  })
}
