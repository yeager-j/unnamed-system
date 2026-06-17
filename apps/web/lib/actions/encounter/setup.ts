"use server"

import { addOccupant } from "@workspace/game/engine"
import {
  err,
  ok,
  type CombatSession,
  type MapInstanceState,
  type Result,
} from "@workspace/game/foundation"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { type WriteExecutor } from "@/lib/db/client"
import { loadEncounterRowById } from "@/lib/db/queries/load-encounter"
import { loadMapInstanceById } from "@/lib/db/queries/map-instance"
import { saveEncounterSession } from "@/lib/db/writes/encounter"
import { guardMany } from "@/lib/db/writes/guard-many"
import { saveMapInstanceState } from "@/lib/db/writes/map-instance"
import { reduceCombatSession } from "@/lib/game-engine"

import { revalidateEncounter } from "./revalidate"
import {
  AddSetupCombatantsSchema,
  type AddSetupCombatantsError,
  type AddSetupCombatantsInput,
} from "./setup.schema"

/**
 * Appends combatants to a draft encounter's roster (UNN-347). The interactive
 * setup shell drives add/remove/side/placement/engagement through the optimistic
 * `applyCombatEvent` path; this batch action backs the catalog enemy-add
 * sub-route (UNN-346), which commits a staged queue and navigates back.
 *
 * Flow mirrors `applyCombatEvent`'s `addCombatant` cross-write (UNN-459): parse →
 * load the encounter **and its Instance** → authorize against the owning campaign
 * (`requireCampaignDM` trips `forbidden()` for a non-DM) → fold each new combatant
 * through the **same** `addCombatant` reducer the live console uses **and** place
 * its occupancy token via `addOccupant`, with a deterministic id keying both rows
 * → save both in one `guardMany` transaction guarded on the two versions. Because
 * it appends to the *loaded* session/Instance rather than rebuilding from a
 * client-supplied roster, the zone graph and existing combatants survive
 * untouched with no merge code. Placement completeness is **not** enforced here
 * (catalog adds land unplaced on the enemies side); the `startCombat` path is
 * where placement is gated server-side.
 */
export async function addSetupCombatantsAction(
  input: AddSetupCombatantsInput
): Promise<Result<{ version: number }, AddSetupCombatantsError>> {
  const parsed = AddSetupCombatantsSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { encounterId, expectedVersion, expectedInstanceVersion, combatants } =
    parsed.data

  const encounter = await loadEncounterRowById(encounterId)
  if (encounter === null) return err("encounter-not-found")
  await requireCampaignDM(encounter.campaignId)

  const instance = await loadMapInstanceById(encounter.mapInstanceId)
  if (instance === null) return err("map-instance-not-found")

  let nextSession: CombatSession = encounter.session
  let nextInstance: MapInstanceState = instance.state
  for (const setup of combatants) {
    const id = setup.id ?? crypto.randomUUID()
    const withId = { ...setup, id }
    nextSession = reduceCombatSession(nextSession, {
      kind: "addCombatant",
      setup: withId,
    })
    nextInstance = addOccupant(nextInstance, id, {
      zoneId: withId.zoneId,
      engagement: withId.engagement ?? { status: "free" },
    })
  }

  const result = await guardMany<{ version: number }, AddSetupCombatantsError>(
    async (tx: WriteExecutor) => {
      const enc = await saveEncounterSession(
        encounterId,
        nextSession,
        expectedVersion,
        tx
      )
      if (!enc.ok) return enc
      const inst = await saveMapInstanceState(
        tx,
        encounter.mapInstanceId,
        nextInstance,
        expectedInstanceVersion
      )
      if (!inst.ok) return inst
      return ok({ version: enc.value.version })
    }
  )
  if (!result.ok) return result

  revalidateEncounter(encounter)
  return result
}
