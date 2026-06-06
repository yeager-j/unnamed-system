"use server"

import { err, ok, type Result } from "@workspace/game/foundation"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import {
  loadEncounterCampaignId,
  loadEncounterRowById,
} from "@/lib/db/queries/load-encounter"
import { setEncounterStatus } from "@/lib/db/writes/encounter"

import {
  EndEncounterSchema,
  type EndEncounterError,
  type EndEncounterInput,
} from "./end.schema"
import { revalidateEncounter } from "./revalidate"

/**
 * Ends an encounter (UNN-320): flips its DB `status` to `"ended"` in a single
 * version-guarded write. The page already forks `ended → EncounterEndedStub`.
 *
 * Per the ADR (*End of combat* / *Cross-aggregate writes*), the tracker writes
 * **only the encounter row** — never a character row. Combat state (ailments,
 * battle conditions) lives on the session overlay, so ending discards it for
 * free; there is no PC-vitals write and no `EmittedEdit` fan-out. Fallen PCs
 * recover to 1 HP as a player self-heal on their own sheet (the console only
 * *reminds*, via the end-combat dialog).
 *
 * Flow mirrors {@link import("./events").applyCombatEvent}: authorize the caller
 * against the owning campaign (`requireCampaignDM` trips `forbidden()` for a
 * non-DM) **before** any heavy load, flip the status guarded on `expectedVersion`,
 * then revalidate the console route.
 */
export async function endEncounterAction(
  input: EndEncounterInput
): Promise<Result<{ version: number }, EndEncounterError>> {
  const parsed = EndEncounterSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { encounterId, expectedVersion } = parsed.data

  const campaignId = await loadEncounterCampaignId(encounterId)
  if (campaignId === null) return err("encounter-not-found")
  await requireCampaignDM(campaignId)

  const result = await setEncounterStatus(encounterId, "ended", expectedVersion)
  if (!result.ok) return result

  const encounter = await loadEncounterRowById(encounterId)
  if (encounter !== null) revalidateEncounter(encounter)

  return ok({ version: result.value.version })
}
