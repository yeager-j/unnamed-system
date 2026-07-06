"use server"

import { err, ok, type Result } from "@workspace/game/foundation"

import { requireOwnerOrCampaignDMForEntity } from "@/lib/auth/campaign-access"

import {
  GetCombatantVitalsVersionSchema,
  type CombatantVitalsVersionError,
  type GetCombatantVitalsVersionInput,
} from "./vitals-version.schema"

/**
 * Read-only Server Action for the **durable arm's** stale-retry path (UNN-535;
 * UNN-551) — the combat-console analog of `getCharacterVersionsAction`, gated
 * `requireOwnerOrCampaignDMForEntity` (the same gate the durable write itself
 * runs): the owner's own retry stays owner-gated, while the DM's drawer write on
 * a placed PC can also refetch the fresh `vitalsVersion` and retry once. The gate
 * returns the `entity` row directly, so the token read is one query and a missing
 * entity trips `forbidden()` (403) rather than a data-race not-found.
 */
export async function getCombatantVitalsVersionAction(
  input: GetCombatantVitalsVersionInput
): Promise<Result<{ version: number }, CombatantVitalsVersionError>> {
  const parsed = GetCombatantVitalsVersionSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const row = await requireOwnerOrCampaignDMForEntity(parsed.data.characterId)

  return ok({ version: row.vitalsVersion })
}
