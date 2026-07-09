"use server"

import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import { loadEncounterVersionByShortId } from "@/lib/db/queries/load-encounter"

import {
  GetEncounterVersionSchema,
  type GetEncounterVersionError,
  type GetEncounterVersionInput,
} from "./version.schema"

/**
 * Read-only Server Action for the encounter stale-retry path (UNN-378) — the
 * encounter analog of `getCharacterVersionsAction`. When a guarded encounter
 * write returns `"stale"`, the queued-write hook calls this to learn the current
 * `version` and re-dispatches the event once with the fresh token.
 *
 * Keyed on the public `shortId` and ungated: the version is non-sensitive (the
 * watch snapshot already exposes it), and both the DM console and the player
 * watch view need it. Authorization on the *write* itself stays at each write
 * action's boundary (`requireCampaignDM` / per-combatant ownership), unchanged.
 */
export async function getEncounterVersionAction(
  input: GetEncounterVersionInput
): Promise<Result<{ version: number }, GetEncounterVersionError>> {
  const parsed = GetEncounterVersionSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const version = await loadEncounterVersionByShortId(parsed.data.shortId)
  if (version === null) return err("encounter-not-found")

  return ok({ version })
}
