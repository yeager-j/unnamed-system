"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { err, ok, type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { db, type WriteExecutor } from "@/lib/db/client"
import {
  loadActiveDungeonForCampaign,
  loadDungeonVariantForWrite,
} from "@/lib/db/queries/load-dungeon"
import { mapInstances } from "@/lib/db/schema/map-instance"
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
 * exploration-time peer of the encounter lifecycle commands. Ordinary delves
 * only: a Region **expedition** is refused (UNN-589 D11's variant sealing —
 * `startExpeditionAction` / `finishExpeditionAction` own that lifecycle, which
 * carries folds and the instance freeze this generic flip must not bypass).
 *
 * Concurrency (D11; de-versioned by UNN-657): the flip runs as a
 * {@link guardMany} whose body opens with the dungeon-row lifecycle lock,
 * checks the **legal transition on the locked row**, and saves guarded on the
 * locked row's own version — no client token. The one-active rule keeps its
 * friendly pre-read and is DB-enforced by the partial unique index.
 *
 * Ambiguous-delivery strategy — desired state: a redelivered flip whose
 * target status already holds on the locked row returns `ok` with the current
 * versions and writes nothing (in particular, `done → done` must not re-freeze
 * or double-bump).
 *
 * An ordinary finish locks and freezes its Map Instance in the same
 * transaction, so no Replica mutation can land after `done`.
 */
export async function setDungeonStatusAction(
  input: SetDungeonStatusInput
): Promise<
  Result<{ version: number; instanceVersion?: number }, SetDungeonStatusError>
> {
  const parsed = SetDungeonStatusSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { dungeonId, status } = parsed.data

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
      { version: number; instanceVersion?: number; committed: boolean },
      SetDungeonStatusError
    >(async (tx: WriteExecutor) => {
      const locked = await lockDungeonRowForLifecycle(tx, dungeonId)
      if (!locked.ok) return locked
      if (locked.value.status === status) {
        return ok({ version: locked.value.version, committed: false })
      }
      if (status === "active" && locked.value.status !== "draft") {
        return err("delve-not-draft")
      }
      if (status === "done" && locked.value.status !== "active") {
        return err("delve-not-active")
      }

      if (status === "active") {
        const flipped = await setDungeonStatus(
          dungeonId,
          status,
          locked.value.version,
          tx
        )
        if (!flipped.ok) return flipped
        return ok({ version: flipped.value.version, committed: true })
      }

      const instance = await loadMapInstanceForWriteLocked(
        tx,
        dungeon.mapInstanceId
      )
      if (!instance.ok) return instance
      const finished = await setDungeonStatus(
        dungeonId,
        status,
        locked.value.version,
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
        committed: true,
      })
    })
  )
  if (!result.ok) return result

  if (!result.value.committed) {
    // Desired state already held (a redelivered or raced flip): report the
    // current versions, publish nothing. Only a `done` no-op reads the frozen
    // Instance's version — an `active` no-op has no instance fact to report.
    if (status !== "done") return ok({ version: result.value.version })
    const [instanceRow] = await db
      .select({ version: mapInstances.version })
      .from(mapInstances)
      .where(eq(mapInstances.id, dungeon.mapInstanceId))
      .limit(1)
    return ok({
      version: result.value.version,
      ...(instanceRow !== undefined
        ? { instanceVersion: instanceRow.version }
        : {}),
    })
  }

  publishDungeonPing(dungeon.shortId, { version: result.value.version, status })
  if (result.value.instanceVersion !== undefined) {
    publishDungeonInstancePing(dungeon.shortId, result.value.instanceVersion)
  }
  revalidatePath(`/campaigns/${campaign.shortId}`)
  revalidateDungeon(dungeon)

  return ok({
    version: result.value.version,
    ...(result.value.instanceVersion !== undefined
      ? { instanceVersion: result.value.instanceVersion }
      : {}),
  })
}
