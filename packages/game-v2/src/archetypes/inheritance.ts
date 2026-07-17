import type { Archetype } from "@workspace/game-v2/archetypes/archetype"
import type { InheritanceSlot } from "@workspace/game-v2/archetypes/archetypes.schema"
import type { ArchetypeEntry } from "@workspace/game-v2/archetypes/display"
import { hasUnlockedRank } from "@workspace/game-v2/archetypes/rank"
import type { ResolvedArchetypeSkill } from "@workspace/game-v2/archetypes/resolved-skill"
import type { ComponentRegistry } from "@workspace/game-v2/kernel/component-registry"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import { err, ok, type Result } from "@workspace/result"

/**
 * Inheritance Slot resolution (PRD §7.8, ported from v1 `engine/archetypes/
 * inheritance.ts`). A slot on one unlocked Archetype holds a single Skill inherited
 * from **another** unlocked Archetype, chosen from that source's Skills available at
 * the character's current Rank in it. Synthesis Skills cannot be inherited.
 *
 * {@link isInheritableSkill} is the single source of truth the whole feature shares:
 * it backs both the write-path validation (the picker) and the read-side "is this
 * configured slot still valid?" flag (`display.ts`'s resolved slot). It is already
 * key/rank-shaped — no `characterArchetype` row coupling — so it ports verbatim;
 * v2's only change is that callers key the source by Archetype **key**, not row id.
 */

/**
 * Whether `skillKey` is a Skill the `source` Archetype offers for inheritance at
 * `sourceRank`: one of its Rank-keyed Skills (the Synthesis Skill lives on
 * `synthesisSkill`, not `skills`, so it is excluded by construction) whose required
 * Rank the source has unlocked (`>=`, D1/G2).
 */
export function isInheritableSkill(
  source: Archetype,
  sourceRank: number,
  skillKey: string
): boolean {
  return source.skills.some(
    (reference) =>
      reference.skill === skillKey &&
      hasUnlockedRank(sourceRank, reference.rank)
  )
}

/** One source Archetype's inheritable Skills, as the slot picker groups them. */
export interface InheritanceSourceGroup {
  /** The source Archetype **key** a chosen slot will point at (v2 keys by key). */
  sourceArchetypeKey: string
  archetype: Archetype
  /** The source Archetype's current Rank — the gate on its `skills`. */
  rank: number
  /** Rank-keyed Skills unlocked at the source's current Rank (no Synthesis). */
  skills: ResolvedArchetypeSkill[]
}

/**
 * Builds the owner-mode slot picker's option groups for the Archetype keyed
 * `ownerKey`: every **other** unlocked Archetype, each with the Skills it offers for
 * inheritance at its current Rank (D2). Reuses the already-resolved
 * {@link ArchetypeEntry.ranks} (Synthesis is tracked separately and never appears
 * there) so no catalog/cost work repeats. Sources with no available Skill are dropped.
 */
export function inheritanceSourceGroups(
  entries: ArchetypeEntry[],
  ownerKey: string
): InheritanceSourceGroup[] {
  return entries
    .filter((entry) => entry.key !== ownerKey)
    .map((entry) => ({
      sourceArchetypeKey: entry.key,
      archetype: entry.archetype,
      rank: entry.rank,
      skills: entry.ranks.filter((ranked) =>
        hasUnlockedRank(entry.rank, ranked.rank)
      ),
    }))
    .filter((group) => group.skills.length > 0)
}

/**
 * The failure modes of an Inheritance-Slot edit: an unowned owner or source
 * (`not-unlocked`), or a slot/source/skill that breaks rulebook 1.3
 * (`invalid-input`). Capability presence is the Writer's check, not a rule.
 */
export type SetInheritanceSlotError = "not-unlocked" | "invalid-input"

/**
 * Upserts one Inheritance {@link InheritanceSlot} onto the owner Archetype keyed
 * `archetypeKey` — the **sole** inheritability gate (`inheritedSkills` grants any
 * resolvable slot Skill without re-checking, so an invalid fill must be rejected
 * before it lands). Validates owner membership, slot bounds
 * (`getArchetype(owner).inheritanceSlots`), and — for a fill — that the source is
 * a *different* unlocked Archetype and the Skill {@link isInheritableSkill} at its
 * Rank. A `slot` with both keys `null` clears it. Takes the owner key + the slot
 * (the engine's own stored shape — no bespoke edit type) and returns the whole
 * updated `archetypes` component (UNN-601); curried deps-first.
 */
export function applySetInheritanceSlot(deps: Pick<GameData, "getArchetype">) {
  return (
    components: Pick<ComponentRegistry, "archetypes">,
    archetypeKey: string,
    slot: InheritanceSlot
  ): Result<Pick<ComponentRegistry, "archetypes">, SetInheritanceSlotError> => {
    const { archetypes } = components
    const owner = archetypes.roster.find((entry) => entry.key === archetypeKey)
    if (owner === undefined) return err("not-unlocked")
    const ownerArchetype = deps.getArchetype(archetypeKey)
    if (
      ownerArchetype === undefined ||
      slot.slotIndex >= ownerArchetype.inheritanceSlots
    ) {
      return err("invalid-input")
    }

    if (slot.skillKey !== null) {
      // A slot inherits from *another* unlocked Archetype (rulebook 1.3); a
      // self-source would smuggle the owner's own kit into an inherited slot,
      // which survives a form swap when the kit itself is suppressed.
      if (
        slot.sourceArchetypeKey === null ||
        slot.sourceArchetypeKey === archetypeKey
      ) {
        return err("invalid-input")
      }
      const source = deps.getArchetype(slot.sourceArchetypeKey)
      const sourceRank = archetypes.roster.find(
        (entry) => entry.key === slot.sourceArchetypeKey
      )?.rank
      if (source === undefined || sourceRank === undefined) {
        return err("not-unlocked")
      }
      if (!isInheritableSkill(source, sourceRank, slot.skillKey)) {
        return err("invalid-input")
      }
    }

    const nextSlots =
      slot.skillKey !== null
        ? upsertInheritanceSlot(owner.inheritanceSlots, slot)
        : owner.inheritanceSlots.filter(
            (existing) => existing.slotIndex !== slot.slotIndex
          )

    return ok({
      archetypes: {
        ...archetypes,
        roster: archetypes.roster.map((entry) =>
          entry.key === archetypeKey
            ? { ...entry, inheritanceSlots: nextSlots }
            : entry
        ),
      },
    })
  }
}

/** Upsert one Inheritance Slot into a roster entry's sparse slot array by
 *  `slotIndex` — replacing a configured slot or appending a fresh one. */
function upsertInheritanceSlot(
  slots: InheritanceSlot[],
  slot: InheritanceSlot
): InheritanceSlot[] {
  return slots.some((existing) => existing.slotIndex === slot.slotIndex)
    ? slots.map((existing) =>
        existing.slotIndex === slot.slotIndex ? slot : existing
      )
    : [...slots, slot]
}
