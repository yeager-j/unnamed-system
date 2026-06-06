import type { Archetype } from "../archetypes/schema"

/**
 * A minimal valid {@link Archetype} for tests that pass an Archetype object
 * directly (e.g. `previewArchetypeSkills`). Defaults to an Initiate Warrior with
 * no skills, no Synthesis Skill, and no mechanic — override only what the test
 * needs (e.g. `skills` with real {@link SkillKey}s, or a `synthesisSkill`).
 *
 * Its `key` is intentionally not a catalog key, so `getArchetype(key)` misses —
 * which is correct for a fixture: the consuming function reads the passed
 * object, not the registry.
 */
export function makeArchetype(overrides: Partial<Archetype> = {}): Archetype {
  return {
    key: "fixture-archetype",
    name: "Fixture Archetype",
    lineage: "warrior",
    tier: "initiate",
    prerequisites: [],
    inheritanceSlots: 0,
    talents: [],
    mastery: { kind: "hp", amount: 0 },
    attributes: { strength: 0, magic: 0, agility: 0, luck: 0 },
    affinities: {},
    skills: [],
    ...overrides,
  }
}
