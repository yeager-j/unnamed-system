"use server"

import { err, ok, type Result } from "@workspace/result"

import { loadInstanceVersionByDungeonShortId } from "@/lib/db/queries/load-dungeon"

import {
  GetDungeonVersionSchema,
  type GetDungeonVersionError,
  type GetDungeonVersionInput,
} from "./version.schema"

/**
 * Read-only Server Action for the dungeon console's **Instance-lane**
 * stale-retry path (UNN-589 D11) — the dungeon twin of
 * {@link import("../encounter/instance-version").getEncounterInstanceVersionAction}:
 * when a guarded spatial write returns `"stale"`, the queued-write hook calls
 * this to learn the delve's current Instance `version` and re-dispatches once
 * with the fresh token. Wiring this closed the console's long-standing
 * "no instance refetch" gap — the finish freeze deliberately stales every
 * in-flight instance token, so the lane must be able to recover from one.
 *
 * Same envelope + gate posture as {@link import("./version").getDungeonVersionAction}:
 * keyed on the public dungeon `shortId` and ungated — the version token is
 * non-sensitive advisory metadata; write authorization stays at each write
 * action's boundary.
 */
export async function getDungeonInstanceVersionAction(
  input: GetDungeonVersionInput
): Promise<Result<{ version: number }, GetDungeonVersionError>> {
  const parsed = GetDungeonVersionSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const version = await loadInstanceVersionByDungeonShortId(parsed.data.shortId)
  if (version === null) return err("dungeon-not-found")

  return ok({ version })
}
