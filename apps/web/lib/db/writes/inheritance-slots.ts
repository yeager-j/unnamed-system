import { eq } from "drizzle-orm"

import { getArchetype, isInheritableSkill } from "@workspace/game/archetypes"
import {
  inheritanceSlotsSchema,
  type InheritanceSlots,
} from "@workspace/game/character"
import { err, ok, type Result } from "@workspace/game/foundation/result"

import { db } from "@/lib/db/client"
import { characterArchetypes } from "@/lib/db/schema/character"
import { EDIT_SURFACE_CLASS } from "@/lib/db/version-classes"

import { bumpCharacterVersionGuarded } from "./version-guard"

/**
 * Persistence for configuring one Inheritance Slot (PRD §7.8, UNN-241). A slot
 * is one field within the owning `characterArchetype` row's `inheritanceSlots`
 * jsonb array, so the write **reads the row and merges by `slotIndex`** rather
 * than trusting a client-composed array (the owner-mode per-field rule). The
 * Mechanics Engine re-derives the active Archetype's Combat Skills list from
 * this column on the next load, so this is a single-row jsonb write gated on
 * `characters.identityVersion` — the same class the active-Archetype pointer
 * rides, since slot configuration is stable Archetype identity.
 *
 * Validation mirrors what the engine assumes (the picker enforces it on the
 * happy path; this is the server-side gate): the owner row must belong to the
 * character, the `slotIndex` must be within the owner Archetype's slot count,
 * and a filled slot's source must be a *different* Archetype the character owns
 * whose current Rank makes the chosen Skill inheritable (Synthesis Skills are
 * excluded by {@link isInheritableSkill}). A cleared slot skips the source
 * checks.
 */

export type InheritanceSlotPersistenceError =
  | "character-not-found"
  | "stale"
  | "archetype-not-owned"
  | "invalid-slot"

export interface InheritanceSlotPersistenceSuccess {
  /** The owning Archetype's merged slot array, echoed for the optimistic frame. */
  inheritanceSlots: InheritanceSlots
  /** The bumped `identityVersion`. */
  version: number
}

export interface SetInheritanceSlotArgs {
  characterArchetypeId: string
  slotIndex: number
  sourceCharacterArchetypeId: string | null
  skillKey: string | null
}

/**
 * Writes one slot on the owning `characterArchetype` row, validating ownership,
 * slot bounds, and inheritability before the guarded `identityVersion` bump.
 */
export async function setInheritanceSlot(
  characterId: string,
  args: SetInheritanceSlotArgs,
  expectedVersion: number
): Promise<
  Result<InheritanceSlotPersistenceSuccess, InheritanceSlotPersistenceError>
> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: characterArchetypes.id,
        archetypeKey: characterArchetypes.archetypeKey,
        rank: characterArchetypes.rank,
        inheritanceSlots: characterArchetypes.inheritanceSlots,
      })
      .from(characterArchetypes)
      .where(eq(characterArchetypes.characterId, characterId))

    const owner = rows.find((row) => row.id === args.characterArchetypeId)
    if (!owner) return err("archetype-not-owned")

    const ownerArchetype = getArchetype(owner.archetypeKey)
    if (!ownerArchetype || args.slotIndex >= ownerArchetype.inheritanceSlots) {
      return err("invalid-slot")
    }

    if (args.skillKey !== null) {
      if (
        args.sourceCharacterArchetypeId === null ||
        args.sourceCharacterArchetypeId === owner.id
      ) {
        return err("invalid-slot")
      }
      const source = rows.find(
        (row) => row.id === args.sourceCharacterArchetypeId
      )
      const sourceArchetype = source
        ? getArchetype(source.archetypeKey)
        : undefined
      if (
        !source ||
        !sourceArchetype ||
        !isInheritableSkill(sourceArchetype, source.rank, args.skillKey)
      ) {
        return err("invalid-slot")
      }
    }

    const merged = inheritanceSlotsSchema.parse([
      ...owner.inheritanceSlots.filter(
        (slot) => slot.slotIndex !== args.slotIndex
      ),
      {
        slotIndex: args.slotIndex,
        sourceCharacterArchetypeId: args.sourceCharacterArchetypeId,
        skillKey: args.skillKey,
      },
    ])

    const bumped = await bumpCharacterVersionGuarded(
      tx,
      characterId,
      EDIT_SURFACE_CLASS.inheritanceSlots,
      expectedVersion
    )
    if (!bumped.ok) return bumped

    await tx
      .update(characterArchetypes)
      .set({ inheritanceSlots: merged })
      .where(eq(characterArchetypes.id, owner.id))

    return ok({ inheritanceSlots: merged, version: bumped.value.version })
  })
}
