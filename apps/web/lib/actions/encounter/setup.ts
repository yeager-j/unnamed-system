"use server"

import { err, type Result } from "@workspace/game/foundation"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { loadEncounterRowById } from "@/lib/db/queries/load-encounter"
import { saveEncounterSession } from "@/lib/db/writes/encounter"
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
 * Flow mirrors `applyCombatEvent`: parse → load the encounter → authorize against
 * the owning campaign (`requireCampaignDM` trips `forbidden()` for a non-DM) →
 * fold each new combatant through the **same** `addCombatant` reducer the live
 * console uses → save guarded on `expectedVersion`. Because it appends to the
 * *loaded* session rather than rebuilding from a client-supplied roster, the zone
 * graph (`zones`/`adjacency`) and the existing combatants survive untouched with
 * no merge code — the trap the retired `saveEncounterSetupAction` had to dodge by
 * hand. Placement completeness is **not** enforced here (catalog adds land
 * unplaced on the enemies side); the `startCombat` path is where placement is
 * gated server-side.
 */
export async function addSetupCombatantsAction(
  input: AddSetupCombatantsInput
): Promise<Result<{ version: number }, AddSetupCombatantsError>> {
  const parsed = AddSetupCombatantsSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { encounterId, expectedVersion, combatants } = parsed.data

  const encounter = await loadEncounterRowById(encounterId)
  if (encounter === null) return err("encounter-not-found")
  await requireCampaignDM(encounter.campaignId)

  const session = combatants.reduce(
    (current, setup) =>
      reduceCombatSession(current, { kind: "addCombatant", setup }),
    encounter.session
  )

  const saved = await saveEncounterSession(
    encounterId,
    session,
    expectedVersion
  )
  if (!saved.ok) return saved

  revalidateEncounter(encounter)

  return saved
}
