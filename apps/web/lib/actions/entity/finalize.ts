"use server"

import { eq } from "drizzle-orm"

import { err, ok, type Result } from "@workspace/result"

import { buildFinalizePatch } from "@/domain/entity/finalize"
import { getArchetype, startingWeaponForLineage } from "@/domain/game-engine-v2"
import { loadEntityRow } from "@/domain/game-v2/entity-row-to-bag"
import { requireEntityOwner } from "@/lib/auth/campaign-access"
import { db } from "@/lib/db/client"
import { playerCharacter } from "@/lib/db/schema/player-character"

import {
  FinalizeEntitySchema,
  type FinalizeEntityError,
  type FinalizeEntityInput,
} from "./finalize.schema"
import { revalidateCharacterList, revalidateEntity } from "./revalidate"
import { bumpEntityVersionGuarded } from "./version-guard"

/**
 * Flips a draft entity to `finalized` (UNN-556; ADR §2.8): assemble the row,
 * run {@link buildFinalizePatch} (the canonical server-side gate — it never
 * trusts the wire), commit the seeded components under the **identity** guard,
 * then flip the PC subtype's `status` to `finalized`. The component patch spans the
 * seeded equipment/mechanics/exhaustion and pruned talents; `status` lives on the
 * `playerCharacter` subtype (R3 — UNN-573) and writes unguarded as the follow-on.
 * A draft is single-writer by construction (the gate re-validates all of it), so
 * the two-statement finalize keeps the "sanctioned one-shot" spirit across the
 * substrate/subtype split.
 *
 * Success returns the `shortId` plus the bumped identity token; the client
 * queue absorbs the token before routing to My Characters (`/`).
 */
export async function finalizeEntityAction(
  input: FinalizeEntityInput
): Promise<Result<{ shortId: string; version: number }, FinalizeEntityError>> {
  const parsed = FinalizeEntitySchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { entity: row } = await requireEntityOwner(parsed.data.entityId)

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

  await db
    .update(playerCharacter)
    .set({ status: "finalized" })
    .where(eq(playerCharacter.entityId, row.id))

  revalidateEntity({ shortId: row.shortId })
  revalidateCharacterList()

  return ok({ shortId: row.shortId, version: committed.value.version })
}
