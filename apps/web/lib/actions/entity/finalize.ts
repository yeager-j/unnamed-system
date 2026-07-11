"use server"

import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import { buildFinalizePatch } from "@/domain/entity/finalize"
import { getArchetype, startingWeaponForLineage } from "@/domain/game-engine-v2"
import { loadEntityRow } from "@/domain/game-v2/entity-row-to-bag"
import { requireEntityOwner } from "@/lib/auth/campaign-access"

import {
  FinalizeEntitySchema,
  type FinalizeEntityError,
  type FinalizeEntityInput,
} from "./finalize.schema"
import { revalidateEntity } from "./revalidate"
import { bumpEntityVersionGuarded } from "./version-guard"

/**
 * Flips a draft entity to `finalized` (UNN-556; ADR §2.8): assemble the row,
 * run {@link buildFinalizePatch} (the canonical server-side gate — it never
 * trusts the wire), and commit its one patch under the **identity** guard. The
 * patch spans the status column plus the seeded equipment/mechanics/exhaustion
 * and pruned talents components — the sanctioned one-shot cross-half write
 * (v1 precedent: finalize always committed everything under `identityVersion`;
 * a draft is single-writer by construction and the gate re-validates all of
 * it).
 *
 * Success returns the `shortId`; the client routes to My Characters (`/`) —
 * the v2 sheet route doesn't exist until S2a.
 */
export async function finalizeEntityAction(
  input: FinalizeEntityInput
): Promise<Result<{ shortId: string }, FinalizeEntityError>> {
  const parsed = FinalizeEntitySchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const row = await requireEntityOwner(parsed.data.entityId)

  const loaded = loadEntityRow(row)
  if (!loaded.ok) return err("entity-load-failed")

  const patch = buildFinalizePatch(row.name, loaded.value.components, {
    getArchetype,
    startingWeaponForLineage,
    newId: () => crypto.randomUUID(),
  })
  if (!patch.ok) return patch

  const committed = await bumpEntityVersionGuarded(
    row.id,
    "identity",
    parsed.data.expectedVersion,
    patch.value
  )
  if (!committed.ok) return committed

  revalidateEntity({ shortId: row.shortId, status: "finalized" })

  return ok({ shortId: row.shortId })
}
