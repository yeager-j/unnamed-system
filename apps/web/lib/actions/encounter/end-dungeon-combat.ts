"use server"

import { pruneCombat, reduceDungeon } from "@workspace/game/engine"
import { err, ok, type Result } from "@workspace/game/foundation"

import { revalidateDungeon } from "@/lib/actions/dungeon/revalidate"
import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { type WriteExecutor } from "@/lib/db/client"
import { loadDungeonRowById } from "@/lib/db/queries/load-dungeon"
import { loadEncounterRowById } from "@/lib/db/queries/load-encounter"
import { loadMapInstanceById } from "@/lib/db/queries/map-instance"
import { saveDungeonState } from "@/lib/db/writes/dungeon"
import { setEncounterStatus } from "@/lib/db/writes/encounter"
import { guardMany } from "@/lib/db/writes/guard-many"
import { saveMapInstanceState } from "@/lib/db/writes/map-instance"
import {
  publishDungeonInstancePing,
  publishDungeonPing,
  publishEncounterPing,
} from "@/lib/realtime/publish"

import {
  EndDungeonCombatSchema,
  type EndDungeonCombatError,
  type EndDungeonCombatInput,
} from "./end-dungeon-combat.schema"

/**
 * **End combat on the dungeon** (UNN-469; ADR — *Combat end*, *Atomicity*): the
 * inverse of {@link import("./start-dungeon-encounter").startDungeonEncounterAction}.
 * One {@link guardMany} transaction flips the Encounter to `ended`, prunes the
 * shared Map Instance back to its empty-in-exploration profile via
 * {@link pruneCombat} (enemy/summoned tokens dropped, every survivor's engagement
 * freed, the Zone Enchantment cleared), and advances the Dungeon turn the fight
 * consumed — the DM's one-tap confirm. The three rows commit together or not at
 * all, so a partial failure leaves all three unchanged.
 *
 * PC tokens persist where they ended: only non-`pc` combatants (the catalog/free
 * enemies + any summon) were added to the Instance at start, so only their token
 * keys are pruned — a party member who sat the fight out keeps their exploration
 * token untouched. HP/SP live on the character row, so post-combat vitals carry
 * over for free (no character write here, mirroring {@link import("./end").endEncounterAction}).
 *
 * Guards (read-then-act at the boundary, before the transaction): `requireCampaignDM`;
 * the encounter must run on **this** delve's Instance and still be `live`.
 */
export async function endDungeonCombatAction(
  input: EndDungeonCombatInput
): Promise<Result<{ version: number }, EndDungeonCombatError>> {
  const parsed = EndDungeonCombatSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const {
    encounterId,
    dungeonId,
    expectedEncounterVersion,
    expectedInstanceVersion,
    expectedDungeonVersion,
  } = parsed.data

  const dungeon = await loadDungeonRowById(dungeonId)
  if (dungeon === null) return err("dungeon-not-found")
  await requireCampaignDM(dungeon.campaignId)

  const encounter = await loadEncounterRowById(encounterId)
  if (encounter === null) return err("encounter-not-found")
  if (encounter.mapInstanceId !== dungeon.mapInstanceId) {
    return err("encounter-not-on-dungeon")
  }
  if (encounter.status !== "live") return err("encounter-not-live")

  const instance = await loadMapInstanceById(dungeon.mapInstanceId)
  if (instance === null) return err("map-instance-not-found")

  // Only non-`pc` combatants got fresh Instance tokens at start; pruning by their
  // ids leaves every PC token (in the fight or not) exactly where it stands.
  const removeCombatantIds = encounter.session.combatants
    .filter((combatant) => combatant.ref.kind !== "pc")
    .map((combatant) => combatant.id)

  const nextInstance = pruneCombat(instance.state, removeCombatantIds)
  const nextDungeon = reduceDungeon(dungeon.state, { kind: "advanceTurn" })

  const result = await guardMany<
    {
      encounterVersion: number
      instanceVersion: number
      dungeonVersion: number
    },
    EndDungeonCombatError
  >(async (tx: WriteExecutor) => {
    const ended = await setEncounterStatus(
      encounterId,
      "ended",
      expectedEncounterVersion,
      tx
    )
    if (!ended.ok) return ended

    const inst = await saveMapInstanceState(
      tx,
      dungeon.mapInstanceId,
      nextInstance,
      expectedInstanceVersion
    )
    if (!inst.ok) return inst

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

  // The encounter ping wakes the watch (status `ended` stops its poll); the two
  // dungeon pings wake the run console + fog view — the Instance bump (pruned
  // tokens) and the dungeon-row bump (advanced turn).
  publishEncounterPing(encounter.shortId, {
    version: result.value.encounterVersion,
    status: "ended",
  })
  publishDungeonInstancePing(dungeon.shortId, result.value.instanceVersion)
  publishDungeonPing(dungeon.shortId, {
    version: result.value.dungeonVersion,
    status: dungeon.status,
  })
  revalidateDungeon(dungeon)

  return ok({ version: result.value.encounterVersion })
}
