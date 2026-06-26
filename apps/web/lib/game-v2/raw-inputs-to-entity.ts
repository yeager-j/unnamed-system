import type { Entity } from "@workspace/game-v2/kernel"
import type { RawCharacterInputs } from "@workspace/game/engine"

/**
 * The **`CharacterRow → Entity` projection adapter** (UNN-500) — the transition
 * shim that maps v1's persisted character inputs onto a v2 component {@link Entity}.
 * It lives in `apps/web`, not `game-v2`, because it must read v1's `CharacterRow`
 * and v2 is independence-gated (no `@workspace/game` imports inside its `src`);
 * the in-package `loader.ts` stays deferred to cutover for the same reason.
 *
 * It only projects the slice the base-layer `resolve` consumes (the derivation
 * inputs + the stat capabilities); equipment/mechanics/skills join as their PRs
 * land. A PC's stat capabilities carry a zeros/neutral/0 `base` (D37) — its real
 * values come from the `Archetypes` + `Level`/`Path` layers, which are the rest of
 * the entity.
 *
 * The depletion fields default to **0** (full pools): v1 stores `currentHP`, but v2
 * stores `damage = maxHP − currentHP`, and the real maxHP isn't known at projection
 * time (it's derived). The actual `currentHP → damage` conversion happens at the
 * cutover migration (where maxHP is resolved) and in the golden-master (which has
 * v1's resolved maxima). Resources/Exhaustion are presence-based components projected
 * by their consuming PRs. */
export function rawInputsToEntity(raw: RawCharacterInputs): Entity {
  const { row, archetypeRows } = raw

  // v1 identifies the active Archetype by a surrogate row id; v2 keys the roster
  // by Archetype key (one entry per Archetype — D36), so resolve the id to a key.
  const keyOf = (id: string | null) =>
    archetypeRows.find((a) => a.id === id)?.archetypeKey ?? null

  return {
    id: row.id,
    components: {
      identity: { name: row.name },
      level: { value: row.level },
      path: { choice: row.pathChoice },
      archetypes: {
        active: keyOf(row.activeArchetypeId),
        origin: keyOf(row.originCharacterArchetypeId),
        savedArchetypeRanks: row.savedArchetypeRanks,
        roster: archetypeRows.map((a) => ({
          key: a.archetypeKey,
          rank: a.rank,
          // v1 slots reference the source by surrogate row id; v2 keys by Archetype
          // key (D36 / UNN-504), so translate each source id through `keyOf`.
          inheritanceSlots: a.inheritanceSlots.map((slot) => ({
            slotIndex: slot.slotIndex,
            sourceArchetypeKey: keyOf(slot.sourceCharacterArchetypeId),
            skillKey: slot.skillKey,
          })),
        })),
      },
      manualBonuses: row.manualBonuses,
      // A PC's stat capabilities have a zeros/neutral/0 base (D37); the Archetypes
      // + Level/Path layers above supply its real values.
      attributes: { base: { strength: 0, magic: 0, agility: 0, luck: 0 } },
      affinities: { base: {} },
      vitals: { base: 0, damage: 0 },
      skillPool: { base: 0, spSpent: 0 },
      // A leveled PC carries its consumable spend-state, so `resolve` emits the dice
      // pools. Projected at full (zeros) here — the real `used` counts (from the
      // row's `*Remaining` columns) join with the depletion projection at cutover.
      resources: { hitDiceUsed: 0, skillDiceUsed: 0, prismaUsed: 0 },
    },
  }
}
