"use server"

import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import {
  requireEntityOwner,
  requireOwnerOrCampaignDMForEntity,
} from "@/lib/auth/campaign-access"
import type { EntityRow } from "@/lib/db/schema/entity"
import type { VersionClass } from "@/lib/db/version-classes"

import {
  GetEntityClassVersionSchema,
  type GetEntityClassVersionError,
  type GetEntityClassVersionInput,
} from "./versions.schema"

/**
 * Read-only Server Action for a write queue's **one-shot stale-retry** (UNN-567)
 * — the current token of one version class on one `entity` row. The gate is a
 * fact of the class, exactly mirroring `commitEntityWrite`'s write gate
 * (UNN-556): a `vitals`-class token admits owner-or-campaign-DM (the DM
 * console's durable lane retries through here), every other class requires the
 * strict owner. The gate returns the row, so the token read is one query and a
 * missing entity trips `forbidden()` (403) rather than a data-race not-found.
 */
export async function getEntityClassVersionAction(
  input: GetEntityClassVersionInput
): Promise<Result<{ version: number }, GetEntityClassVersionError>> {
  const parsed = GetEntityClassVersionSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { entityId, versionClass } = parsed.data
  const pc =
    versionClass === "vitals"
      ? await requireOwnerOrCampaignDMForEntity(entityId)
      : await requireEntityOwner(entityId)

  return ok({ version: classVersionOf(pc.entity, versionClass) })
}

function classVersionOf(row: EntityRow, versionClass: VersionClass): number {
  switch (versionClass) {
    case "identity":
      return row.identityVersion
    case "vitals":
      return row.vitalsVersion
    case "inventory":
      return row.inventoryVersion
    case "progression":
      return row.progressionVersion
  }
}
