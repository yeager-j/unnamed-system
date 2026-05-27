import type { SeedCharacter } from "@/lib/__fixtures__/seed-characters"

import type { E2EFixture } from "./types"

/**
 * Dedicated target for `e2e/delete-character.spec.ts`. Owned by the dev
 * user. Sized just large enough to prove CASCADE: one archetype, one
 * inventory item, one knife/chain. Lives in its own row because the
 * happy-path test removes it — `npm run db:seed` runs at the start of
 * every E2E invocation and re-inserts it via the same deterministic
 * upsert.
 */
const seed: SeedCharacter = {
  slug: "delete-target",
  shortId: "delete-target",
  name: "Wren Halloway",
  pronouns: "they/them",
  level: 1,
  pathChoice: "balanced",
  activeArchetypeKey: "warrior",
  archetypes: [
    {
      archetypeKey: "warrior",
      rank: 1,
      mechanicState: { kind: "perfection", rank: 0 },
    },
  ],
  manualBonuses: {},
  ancestryText: "",
  backgroundText: "",
  backstoryText: "",
  personalityTraits: null,
  hopes: null,
  dreams: null,
  fears: null,
  secrets: null,
  notes: "",
  knives: [],
  chains: [],
  gainedTalents: [],
  items: [{ catalogItemKey: "longsword", equipped: false }],
  victories: 0,
  virtues: { expression: 0, empathy: 0, wisdom: 0, focus: 0 },
  sparkLog: [],
  exhaustion: 0,
  ailments: [],
  battleConditions: null,
  partyComposition: null,
}

export const deleteTarget: E2EFixture = {
  seed,
  characterId: `seed-char-${seed.slug}`,
  url: `/c/${seed.shortId}`,
}
