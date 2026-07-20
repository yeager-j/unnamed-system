"use server"

import { reduceDungeon } from "@workspace/game-v2/spatial"
import { err, ok, type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { type WriteExecutor } from "@/lib/db/client"
import {
  loadDungeonCampaignId,
  loadDungeonRowById,
} from "@/lib/db/queries/load-dungeon"
import {
  lockDungeonRowForLifecycle,
  saveDungeonState,
} from "@/lib/db/writes/dungeon"
import { guardMany } from "@/lib/db/writes/guard-many"
import { publishDungeonPing } from "@/lib/realtime/publish"

import {
  ApplyDungeonEventSchema,
  type ApplyDungeonEventError,
  type ApplyDungeonEventInput,
} from "./events.schema"
import { revalidateDungeon } from "./revalidate"

/**
 * The impure shell that drives the dungeon run console's turn loop (ADR —
 * *Reducer topology*; de-versioned by UNN-657): it applies one
 * `markActed`/`advanceTurn` event to a delve under the dungeon-row lifecycle
 * lock and saves guarded on the locked row's own version. Spatial events are
 * intentionally absent — they travel through the Map Instance Replica.
 *
 * Preconditions on the LOCKED row: the delve must be `active` (D11's seal —
 * frozen history is structural), and `advanceTurn` must find the counter at
 * its semantic `expectedTurn` — a duplicate or raced advance refuses
 * `turn-already-advanced` rather than silently consuming a second turn.
 * `markActed` on an already-acted id is the reducer's same-ref no-op: the
 * action reports `ok` with the current version and writes nothing.
 */
export async function applyDungeonEvent(
  input: ApplyDungeonEventInput
): Promise<Result<{ version: number }, ApplyDungeonEventError>> {
  const parsed = ApplyDungeonEventSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { dungeonId, event, expectedTurn } = parsed.data

  const campaignId = await loadDungeonCampaignId(dungeonId)
  if (campaignId === null) return err("dungeon-not-found")
  await requireCampaignDM(campaignId)

  const dungeon = await loadDungeonRowById(dungeonId)
  if (dungeon === null) return err("dungeon-not-found")

  const result = await guardMany<
    { version: number; committed: boolean },
    ApplyDungeonEventError
  >(async (tx: WriteExecutor) => {
    const locked = await lockDungeonRowForLifecycle(tx, dungeonId)
    if (!locked.ok) return locked
    if (locked.value.status !== "active") return err("delve-not-active")
    if (
      event.kind === "advanceTurn" &&
      locked.value.state.turnCounter !== expectedTurn
    ) {
      return err("turn-already-advanced")
    }

    const next = reduceDungeon(locked.value.state, event)
    if (next === locked.value.state) {
      return ok({ version: locked.value.version, committed: false })
    }
    const saved = await saveDungeonState(
      dungeonId,
      next,
      locked.value.version,
      tx
    )
    if (!saved.ok) return saved
    return ok({ version: saved.value.version, committed: true })
  })
  if (!result.ok) return result

  if (result.value.committed) {
    publishDungeonPing(dungeon.shortId, {
      version: result.value.version,
      status: dungeon.status,
    })
    revalidateDungeon(dungeon)
  }
  return ok({ version: result.value.version })
}
