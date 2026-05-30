import { eq } from "drizzle-orm"

import {
  archetypeId,
  type SeedCharacter,
} from "@/lib/__fixtures__/seed-characters"
import { characters, getDb } from "@/lib/db"

import type { E2EFixture } from "./types"

/**
 * Dedicated target for `e2e/archetype-switch.spec.ts` (UNN-238). Owned by the
 * dev user; active Archetype is Warrior, with Mage and Knight also unlocked so
 * the header switcher has something to switch to. The three Archetypes sit in
 * three distinct Lineages (Warrior / Mage / Knight) so the spec can assert the
 * picker's per-Lineage grouping, and carry distinct Ranks so the per-option
 * `Tier · Rank · Mechanic` detail line is meaningful.
 *
 * Lives in its own row because the switch spec re-points `activeArchetypeId`;
 * sharing seed-knight (pinned Active = Knight by `archetypes-tab.spec.ts` /
 * `mechanics.spec.ts`) would flake those read-only specs.
 *
 * Warrior → Mage is the witness pair: Strength flips +2 → −1, Magic flips
 * −1 → +2, Ice goes Neutral → Resist, and the Mechanic widget swaps
 * Perfection → Stains — clean engine assertions that the active Archetype
 * drives derived state.
 */
const seed: SeedCharacter = {
  slug: "archetype-switch-target",
  shortId: "archetype-switch-target",
  name: "Pell Aldaric",
  pronouns: "they/them",
  level: 5,
  pathChoice: "balanced",
  activeArchetypeKey: "warrior",
  archetypes: [
    { archetypeKey: "warrior", rank: 2 },
    { archetypeKey: "mage", rank: 1 },
    { archetypeKey: "knight", rank: 1 },
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
  items: [],
  victories: 0,
  virtues: { expression: 0, empathy: 0, wisdom: 0, focus: 0 },
  sparkLog: [],
  exhaustion: 0,
  ailments: [],
  battleConditions: null,
  partyComposition: null,
}

export const archetypeSwitchTarget: E2EFixture = {
  seed,
  characterId: `seed-char-${seed.slug}`,
  url: `/c/${seed.shortId}`,
}

/** Deterministic `characterArchetype` row id for one of this target's
 *  Archetypes — the value `activeArchetypeId` points at. */
export function switchTargetArchetypeId(archetypeKey: string): string {
  return archetypeId(seed.slug, archetypeKey)
}

/**
 * Resets the active Archetype back to Warrior between tests so each case
 * starts from the same baseline (the spec switches it to Mage/Knight).
 */
export async function resetArchetypeSwitchTarget(): Promise<void> {
  await getDb()
    .update(characters)
    .set({ activeArchetypeId: switchTargetArchetypeId("warrior") })
    .where(eq(characters.id, archetypeSwitchTarget.characterId))
}

/** Reads the persisted `activeArchetypeId` straight off the character row. */
export async function getActiveArchetypeId(): Promise<string | null> {
  const [row] = await getDb()
    .select({ activeArchetypeId: characters.activeArchetypeId })
    .from(characters)
    .where(eq(characters.id, archetypeSwitchTarget.characterId))
    .limit(1)
  if (!row) throw new Error("archetype-switch-target character row missing")
  return row.activeArchetypeId
}
