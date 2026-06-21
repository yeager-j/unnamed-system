"use server"

import { err, ok, type Result } from "@workspace/game/foundation"

import { loadDungeonVersionByShortId } from "@/lib/db/queries/load-dungeon"

import {
  GetDungeonVersionSchema,
  type GetDungeonVersionError,
  type GetDungeonVersionInput,
} from "./version.schema"

/**
 * Read-only Server Action for the dungeon stale-retry path — the dungeon analog of
 * {@link import("../encounter/version").getEncounterVersionAction}. When a guarded
 * dungeon write returns `"stale"`, the queued-write hook calls this to learn the
 * current `version` and re-dispatches the event once with the fresh token.
 *
 * Keyed on the public `shortId` and ungated: the version is non-sensitive advisory
 * metadata. Authorization on the *write* itself stays at each write action's
 * boundary (`requireCampaignDM`), unchanged.
 */
export async function getDungeonVersionAction(
  input: GetDungeonVersionInput
): Promise<Result<{ version: number }, GetDungeonVersionError>> {
  const parsed = GetDungeonVersionSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const version = await loadDungeonVersionByShortId(parsed.data.shortId)
  if (version === null) return err("dungeon-not-found")

  return ok({ version })
}
