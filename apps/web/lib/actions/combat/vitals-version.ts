"use server"

import { err, ok, type Result } from "@workspace/game/foundation"

import { requireOwnerOrCampaignDM } from "@/lib/auth/campaign-access"
import { loadCharacterVersions } from "@/lib/db/queries/versions"

import {
  GetCombatantVitalsVersionSchema,
  type CombatantVitalsVersionError,
  type GetCombatantVitalsVersionInput,
} from "./vitals-version.schema"

/**
 * Read-only Server Action for the **durable arm's** stale-retry path (UNN-535)
 * — the combat-console analog of `getCharacterVersionsAction`, but gated
 * `requireOwnerOrCampaignDM` (the same gate the durable write itself runs,
 * UNN-297): the sheet's own retry stays owner-gated, while the DM's drawer
 * write on a placed PC can also refetch the fresh `vitalsVersion` and retry
 * once. Returns only the vitals-class token — the one class the write-router's
 * durable arm guards on.
 */
export async function getCombatantVitalsVersionAction(
  input: GetCombatantVitalsVersionInput
): Promise<Result<{ version: number }, CombatantVitalsVersionError>> {
  const parsed = GetCombatantVitalsVersionSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const character = await requireOwnerOrCampaignDM(parsed.data.characterId)

  const versions = await loadCharacterVersions(character.id)
  if (!versions) return err("character-not-found")

  return ok({ version: versions.vitalsVersion })
}
