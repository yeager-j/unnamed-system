"use server"

import { saveSession, sweepOverlay } from "@workspace/game-v2/encounter"
import { pruneCombat, reduceDungeon } from "@workspace/game-v2/spatial"
import { err, ok, type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { type WriteExecutor } from "@/lib/db/client"
import { loadDungeonRowById } from "@/lib/db/queries/load-dungeon"
import { loadEncounterAndInstanceVersions } from "@/lib/db/queries/load-encounter"
import { loadEncounterForWriteLocked } from "@/lib/db/queries/load-encounter-session"
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
 * End combat on a delve (UNN-536, PR11c; de-versioned by UNN-657) — the
 * inverse of {@link import("./start-encounter").startDungeonEncounterAction}.
 * One {@link guardMany} transaction composes the v2 combat-end over **three**
 * rows, locked in the canonical D11 order dungeon → mapInstance → encounter:
 *
 * 1. the session blob saves **swept** ({@link sweepOverlay} clears every
 *    survivor's combat-scoped overlay; durable components survive),
 * 2. the encounter's status flips `live → ended`,
 * 3. the shared Instance saves **pruned** ({@link pruneCombat} drops the
 *    ephemeral combatants' tokens, frees every survivor's engagement, clears
 *    the Zone Enchantment; PC tokens persist where the fight ended — R23.3
 *    parity), and
 * 4. the dungeon turn the fight consumed advances (`reduceDungeon(advanceTurn)`)
 *    from the **locked** row's state.
 *
 * No client version tokens: every row saves guarded on its own locked
 * version. The sweep/prune now also computes from the LOCKED encounter read.
 *
 * Ambiguous-delivery strategy — `ended` is terminal desired state, but the
 * turn advance is not idempotent: a redelivered end that finds the encounter
 * already ended returns `ok` with current versions and **must not advance the
 * turn again** (the one subtle case; pinned by test).
 */
export async function endDungeonCombatAction(
  input: EndDungeonCombatInput
): Promise<
  Result<{ version: number; instanceVersion: number }, EndDungeonCombatError>
> {
  const parsed = EndDungeonCombatSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")
  const { encounterId, dungeonId } = parsed.data

  const dungeon = await loadDungeonRowById(dungeonId)
  if (dungeon === null) return err("dungeon-not-found")
  await requireCampaignDM(dungeon.campaignId)

  const result = await guardMany<
    | {
        encounterShortId: string
        encounterVersion: number
        instanceVersion: number
        dungeonVersion: number
      }
    | "already-ended",
    EndDungeonCombatError
  >(async (tx: WriteExecutor) => {
    const locked = await lockDungeonRowForLifecycle(tx, dungeonId)
    if (!locked.ok) return locked

    const instance = await loadMapInstanceForWriteLocked(
      tx,
      dungeon.mapInstanceId
    )
    if (!instance.ok) return instance

    const loaded = await loadEncounterForWriteLocked(tx, encounterId)
    if (!loaded.ok) return loaded
    const { row, loaded: loadedSession } = loaded.value
    if (row.mapInstanceId !== dungeon.mapInstanceId) {
      return err("encounter-not-on-dungeon")
    }
    if (row.status === "ended") return ok("already-ended" as const)
    if (row.status !== "live") return err("encounter-not-live")

    const nextDungeon = reduceDungeon(locked.value.state, {
      kind: "advanceTurn",
    })
    const swept = sweepOverlay(loadedSession.session)
    const stored = saveSession(swept, loadedSession.locators)
    if (!stored.ok) return err("locator-missing")

    const ephemeralIds = loadedSession.session.participants
      .filter(
        (participant) =>
          loadedSession.locators.get(participant.id)?.storage === "inline"
      )
      .map((participant) => participant.id)
    const pruned = pruneCombat(instance.value.state, ephemeralIds)
    const inst = await saveLockedMapInstanceState(tx, instance.value, pruned)
    if (!inst.ok) return inst

    const saved = await saveEncounterSession(
      row.id,
      stored.value,
      row.version,
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
      locked.value.version,
      tx
    )
    if (!dng.ok) return dng

    return ok({
      encounterShortId: row.shortId,
      encounterVersion: ended.value.version,
      instanceVersion: inst.value.version,
      dungeonVersion: dng.value.version,
    })
  })
  if (!result.ok) return result

  if (result.value === "already-ended") {
    const row = await loadEncounterAndInstanceVersions(encounterId)
    return row === null ? err("encounter-not-found") : ok(row)
  }

  publishEncounterPing(result.value.encounterShortId, {
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
