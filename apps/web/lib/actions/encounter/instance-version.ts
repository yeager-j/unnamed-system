"use server"

import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import { loadInstanceVersionByEncounterShortId } from "@/lib/db/queries/load-encounter"

import {
  GetEncounterVersionSchema,
  type GetEncounterVersionError,
  type GetEncounterVersionInput,
} from "./version.schema"

/**
 * Read-only Server Action for the **Instance queue's** stale-retry path
 * (UNN-535) — the Map-Instance twin of {@link getEncounterVersionAction}: when
 * a guarded spatial write returns `"stale"`, the queued-write hook calls this
 * to learn the encounter's current Instance `version` and re-dispatches the
 * event once with the fresh token.
 *
 * Same envelope + gate posture as the encounter version read: keyed on the
 * public encounter `shortId` and ungated — the version token is non-sensitive
 * (the watch snapshot already exposes `instanceVersion`), and authorization on
 * the *write* stays at the write action's boundary.
 */
export async function getEncounterInstanceVersionAction(
  input: GetEncounterVersionInput
): Promise<Result<{ version: number }, GetEncounterVersionError>> {
  const parsed = GetEncounterVersionSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const version = await loadInstanceVersionByEncounterShortId(
    parsed.data.shortId
  )
  if (version === null) return err("encounter-not-found")

  return ok({ version })
}
