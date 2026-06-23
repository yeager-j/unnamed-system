import type { Entity } from "@workspace/game-v2/kernel"
import type { RawCharacterInputs } from "@workspace/game/engine"

/**
 * The **`CharacterRow → Entity` projection adapter** (UNN-500) — the transition
 * shim that maps v1's persisted character inputs onto a v2 component {@link Entity}.
 * It lives in `apps/web`, not `game-v2`, because it must read v1's `CharacterRow`
 * and v2 is independence-gated (no `@workspace/game` imports inside its `src`);
 * the in-package `loader.ts` stays deferred to cutover for the same reason.
 *
 * It only projects the slice PR2's base-layer `resolve` consumes (the derivation
 * inputs + the `derived`-source stat capabilities); equipment/mechanics/skills and
 * the depletion fields join as their PRs land. A PC's stat capabilities all read
 * `source: "derived"` — the recipe is the rest of the entity (D34/D35/D36).
 */
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
      progression: { level: row.level, pathChoice: row.pathChoice },
      archetypes: {
        active: keyOf(row.activeArchetypeId),
        origin: keyOf(row.originCharacterArchetypeId),
        savedArchetypeRanks: row.savedArchetypeRanks,
        roster: archetypeRows.map((a) => ({
          key: a.archetypeKey,
          rank: a.rank,
        })),
      },
      manualBonuses: row.manualBonuses,
      attributes: { source: { kind: "derived" } },
      affinities: { source: { kind: "derived" } },
      vitals: { max: { kind: "derived" } },
      skillPool: { max: { kind: "derived" } },
    },
  }
}
