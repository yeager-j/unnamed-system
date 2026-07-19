"use server"

import { saveSession, sweepOverlay } from "@workspace/game-v2/encounter"
import { pruneCombat, reduceDungeon } from "@workspace/game-v2/spatial"
import { err, ok, type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { type WriteExecutor } from "@/lib/db/client"
import { loadDungeonRowById } from "@/lib/db/queries/load-dungeon"
import { loadEncounterForWrite } from "@/lib/db/queries/load-encounter-session"
import {
  lockDungeonRowForLifecycle,
  saveDungeonState,
} from "@/lib/db/writes/dungeon"
import {
  saveEncounterSession,
  setEncounterStatus,
} from "@/lib/db/writes/encounter"
import { guardMany } from "@/lib/db/writes/guard-many"
import {
  loadMapInstanceForWriteLocked,
  saveLockedMapInstanceState,
} from "@/lib/db/writes/map-instance"
import {
  publishDungeonInstancePing,
  publishDungeonPing,
  publishEncounterPing,
} from "@/lib/realtime/publish"

import {
  EndDungeonCombatSchema,
  type EndDungeonCombatError,
  type EndDungeonCombatInput,
} from "./end-combat.schema"
import { revalidateDungeon } from "./revalidate"

/**
 * End combat on a delve (UNN-536, PR11c) — the inverse of
 * {@link import("./start-encounter").startDungeonEncounterAction}. One
 * {@link guardMany} transaction composes the v2 combat-end over **three** rows:
 *
 * 1. the session blob saves **swept** ({@link sweepOverlay} clears every survivor's
 *    combat-scoped overlay; durable components survive),
 * 2. the encounter's status flips `live → ended`,
 * 3. the shared Instance saves **pruned** ({@link pruneCombat} drops the ephemeral
 *    combatants' tokens, frees every survivor's engagement, clears the Zone
 *    Enchantment; PC tokens persist where the fight ended — R23.3 parity), and
 * 4. the dungeon turn the fight consumed advances (`reduceDungeon(advanceTurn)`).
 *
 * The prune keys are the participants whose locator is `inline` — the ephemeral
 * ones, read off the authoritative out-of-band map (the lifecycle-axis
 * generalization of v1's "non-`pc` combatants", already banked by the mapless
 * `endCombatAction`). PC HP/SP lives on the character row, so post-combat vitals
 * carry over for free. `reduceDungeon` is the v2 exploration reducer — the whole
 * delve runs on `game-v2/spatial` since the UNN-540 cutover.
 *
 * Guards: `requireCampaignDM`; the encounter must run on this delve's Instance and
 * be `live`. The intra-encounter version chains: the status flip guards on the
 * **bumped** version the session save returns.
 */
export async function endDungeonCombatAction(
  input: EndDungeonCombatInput
): Promise<
  Result<{ version: number; instanceVersion: number }, EndDungeonCombatError>
> {
  const parsed = EndDungeonCombatSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const {
    encounterId,
    dungeonId,
    expectedEncounterVersion,
    expectedDungeonVersion,
  } = parsed.data

  const dungeon = await loadDungeonRowById(dungeonId)
  if (dungeon === null) return err("dungeon-not-found")
  await requireCampaignDM(dungeon.campaignId)

  const loaded = await loadEncounterForWrite(encounterId)
  if (!loaded.ok) return loaded
  const { row, loaded: loadedSession } = loaded.value
  if (row.status !== "live") return err("encounter-not-live")
  if (row.mapInstanceId !== dungeon.mapInstanceId) {
    return err("encounter-not-on-dungeon")
  }

  const swept = sweepOverlay(loadedSession.session)
  const stored = saveSession(swept, loadedSession.locators)
  if (!stored.ok) return err("locator-missing")

  const ephemeralIds = loadedSession.session.participants
    .filter(
      (participant) =>
        loadedSession.locators.get(participant.id)?.storage === "inline"
    )
    .map((participant) => participant.id)
  // Lifecycle lock order (D11, UNN-589): dungeon → mapInstance → encounter.
  // Combat end used to write encounter-first; a finish (dungeon → instance)
  // racing that order is a textbook deadlock, so the dungeon lock now opens the
  // body, and the `advanceTurn` reduces from the **locked** row's state — the
  // freshest committed truth, not the pre-transaction read.
  const result = await guardMany<
    {
      encounterVersion: number
      instanceVersion: number
      dungeonVersion: number
    },
    EndDungeonCombatError
  >(async (tx: WriteExecutor) => {
    const locked = await lockDungeonRowForLifecycle(
      tx,
      dungeonId,
      expectedDungeonVersion
    )
    if (!locked.ok) return locked
    const nextDungeon = reduceDungeon(locked.value.state, {
      kind: "advanceTurn",
    })

    const instance = await loadMapInstanceForWriteLocked(
      tx,
      dungeon.mapInstanceId
    )
    if (!instance.ok) return instance
    const pruned = pruneCombat(instance.value.state, ephemeralIds)
    const inst = await saveLockedMapInstanceState(tx, instance.value, pruned)
    if (!inst.ok) return inst

    const saved = await saveEncounterSession(
      row.id,
      stored.value,
      expectedEncounterVersion,
      tx
    )
    if (!saved.ok) return saved

    const ended = await setEncounterStatus(
      row.id,
      "ended",
      saved.value.version,
      tx
    )
    if (!ended.ok) return ended

    const dng = await saveDungeonState(
      dungeonId,
      nextDungeon,
      expectedDungeonVersion,
      tx
    )
    if (!dng.ok) return dng

    return ok({
      encounterVersion: ended.value.version,
      instanceVersion: inst.value.version,
      dungeonVersion: dng.value.version,
    })
  })
  if (!result.ok) return result

  publishEncounterPing(row.shortId, {
    version: result.value.encounterVersion,
    status: "ended",
  })
  publishDungeonInstancePing(dungeon.shortId, result.value.instanceVersion)
  publishDungeonPing(dungeon.shortId, {
    version: result.value.dungeonVersion,
    status: dungeon.status,
  })
  revalidateDungeon(dungeon)

  return ok({
    version: result.value.encounterVersion,
    instanceVersion: result.value.instanceVersion,
  })
}
