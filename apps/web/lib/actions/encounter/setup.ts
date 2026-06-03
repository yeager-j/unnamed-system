"use server"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import {
  loadEncounterCampaignId,
  loadEncounterRowById,
} from "@/lib/db/queries/load-encounter"
import { saveEncounterSession } from "@/lib/db/writes/encounter"
import { createCombatSession } from "@/lib/game/encounter"
import { err, type Result } from "@/lib/result"

import { revalidateEncounter } from "./revalidate"
import {
  SaveEncounterSetupSchema,
  type SaveEncounterSetupError,
  type SaveEncounterSetupInput,
} from "./setup.schema"

/**
 * Persists a draft encounter's assembled setup roster (UNN-302). The setup
 * panels (import PCs / sides / …) build an in-progress `CombatantSetup[]` in the
 * client with no DB write per interaction; this action saves the whole roster on
 * explicit "Save draft", version-guarded on the encounter's single `version`.
 *
 * Flow mirrors `applyCombatEvent`: parse → authorize against the owning campaign
 * (`requireCampaignDM` trips `forbidden()` for a non-DM) → build the canonical
 * `CombatSession` server-side from the (validated) setup roster → save guarded on
 * `expectedVersion`. The encounter stays `draft`; the `draft → live` flip is the
 * separate `startCombat` event (UNN-303/332). Combatant ids are minted fresh on
 * each save (no engagement refs across saves yet — that lands with UNN-301).
 */
export async function saveEncounterSetupAction(
  input: SaveEncounterSetupInput
): Promise<Result<{ version: number }, SaveEncounterSetupError>> {
  const parsed = SaveEncounterSetupSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { encounterId, expectedVersion, combatants } = parsed.data

  const campaignId = await loadEncounterCampaignId(encounterId)
  if (campaignId === null) return err("encounter-not-found")
  await requireCampaignDM(campaignId)

  const session = createCombatSession(combatants)

  const saved = await saveEncounterSession(
    encounterId,
    session,
    expectedVersion
  )
  if (!saved.ok) return saved

  const encounter = await loadEncounterRowById(encounterId)
  if (encounter) revalidateEncounter(encounter)

  return saved
}
