"use server"

import { revalidatePath } from "next/cache"

import { err, ok, type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { type WriteExecutor } from "@/lib/db/client"
import {
  loadActiveDungeonForCampaign,
  loadDungeonVariantForWrite,
} from "@/lib/db/queries/load-dungeon"
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
import {
  publishDungeonInstancePing,
  publishDungeonPing,
} from "@/lib/realtime/publish"

import { revalidateDungeon } from "./revalidate"
import {
  SetDungeonStatusSchema,
  type SetDungeonStatusError,
  type SetDungeonStatusInput,
} from "./status.schema"

/**
 * Advances a dungeon's lifecycle `status` (`draft` → `active` → `done`) — the
 * exploration-time peer of {@link import("../encounter/end").endEncounterAction}
 * plus the `startCombat` status flip. Ordinary delves only: a Region
 * **expedition** is refused (UNN-589 D11's variant sealing —
 * `startExpeditionAction` / `finishExpeditionAction` own that lifecycle, which
 * carries folds and the instance freeze this generic flip must not bypass).
 *
 * Concurrency (D11): the flip runs as a {@link guardMany} whose body opens with
 * the dungeon-row lifecycle lock and checks the **legal transition on the locked
 * row** (`draft → active`, `active → done`) — closing the old gap where
 * `active → done` checked no status at all. The one-active rule keeps its
 * friendly pre-read and is DB-enforced by the partial unique index (a
 * fully-concurrent second activation loses at the index and maps back to the
 * same error). Then revalidates the campaign overview (its dungeons list +
 * live-delve banner) **and** the DM console route (UNN-464). The
 * `draft → active` start is normally driven by
 * {@link import("./delve-start").startDelveAction} (which also snapshots
 * geometry + places tokens); this action backs the `active → done` finish.
 *
 * An ordinary finish locks and freezes its Map Instance in the same transaction,
 * so no Replica mutation can land after `done`.
 */
export async function setDungeonStatusAction(
  input: SetDungeonStatusInput
): Promise<
  Result<{ version: number; instanceVersion?: number }, SetDungeonStatusError>
> {
  const parsed = SetDungeonStatusSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { dungeonId, status, expectedVersion } = parsed.data

  const variant = await loadDungeonVariantForWrite(dungeonId)
  if (variant === null) return err("dungeon-not-found")
  if (variant.kind === "expedition") return err("delve-is-expedition")
  const dungeon = variant.row
  const campaign = await requireCampaignDM(dungeon.campaignId)

  if (status === "active") {
    const active = await loadActiveDungeonForCampaign(dungeon.campaignId)
    if (active && active.id !== dungeonId) {
      return err("campaign-already-has-active-delve")
    }
  }

  const result = await mapActivationRaceToActiveDelve(
    guardMany<
      { version: number; instanceVersion?: number },
      SetDungeonStatusError
    >(async (tx: WriteExecutor) => {
      const locked = await lockDungeonRowForLifecycle(
        tx,
        dungeonId,
        expectedVersion
      )
      if (!locked.ok) return locked
      if (status === "active" && locked.value.status !== "draft") {
        return err("delve-not-draft")
      }
      if (status === "done" && locked.value.status !== "active") {
        return err("delve-not-active")
      }

      if (status === "active") {
        return setDungeonStatus(dungeonId, status, expectedVersion, tx)
      }

      const instance = await loadMapInstanceForWriteLocked(
        tx,
        dungeon.mapInstanceId
      )
      if (!instance.ok) return instance
      const finished = await setDungeonStatus(
        dungeonId,
        status,
        expectedVersion,
        tx
      )
      if (!finished.ok) return finished
      const frozen = await saveLockedMapInstanceState(
        tx,
        instance.value,
        instance.value.state,
        { freeze: true }
      )
      if (!frozen.ok) return frozen
      return ok({
        version: finished.value.version,
        instanceVersion: frozen.value.version,
      })
    })
  )
  if (!result.ok) return result

  publishDungeonPing(dungeon.shortId, { version: result.value.version, status })
  if (result.value.instanceVersion !== undefined) {
    publishDungeonInstancePing(dungeon.shortId, result.value.instanceVersion)
  }
  revalidatePath(`/campaigns/${campaign.shortId}`)
  revalidateDungeon(dungeon)

  return ok(result.value)
}
