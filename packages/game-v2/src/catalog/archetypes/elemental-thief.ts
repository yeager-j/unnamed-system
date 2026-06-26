import type { Archetype } from "@workspace/game-v2/archetypes"

/**
 * Elemental Thief — an Adept evolution of the Thief lineage. Visibility is gated
 * per-user in the app layer (`apps/web/lib/archetypes/restricted.ts`) via the Atlas's
 * `hiddenArchetypeKeys`; the catalog entry itself is unconditional.
 */
export const elementalThief = {
  key: "elemental-thief",
  name: "Elemental Thief",
  lineage: "thief",
  tier: "adept",
  prerequisites: [{ archetype: "thief", rank: 5 }],
  inheritanceSlots: 3,
  talents: ["sneak", "lockpick", "demolish"],
  mastery: { kind: "hp", amount: 20 },
  attributes: { strength: 2, magic: 0, agility: 2, luck: 2 },
  affinities: { ice: "weak", dark: "resist" },
  skills: [
    { rank: 1, skill: "blade-of-fire" },
    { rank: 2, skill: "blade-of-ice" },
    { rank: 3, skill: "blade-of-elec" },
    { rank: 4, skill: "blade-of-wind" },
    { rank: 5, skill: "avarice" },
  ],
  synthesisSkill: { rank: 5, skill: "grand-heist" },
  mechanic: "elemental-larceny",
} satisfies Archetype
