import { eq } from "drizzle-orm"

import {
  archetypeId,
  type SeedCharacter,
} from "@/lib/__fixtures__/seed-characters"
import { characterArchetypes, getDb } from "@/lib/db"

import type { E2EFixture } from "./types"

/**
 * Dedicated target for `e2e/inheritance-slots.spec.ts` (UNN-241). Owned by the
 * dev user; active Archetype is Warrior, with Mage (Rank 2) and Knight (Rank 1)
 * also unlocked so the slot picker has two source Archetypes to group by and a
 * Rank gate to exercise (Mage offers its Rank 1–2 Skills; Knight only Rank 1).
 * All three sit in distinct Lineages.
 *
 * Lives in its own row because the spec writes `inheritanceSlots` on the
 * Warrior row; sharing `archetype-switch-target` (whose spec re-points
 * `activeArchetypeId`) would race the two write specs under `fullyParallel`.
 */
const seed: SeedCharacter = {
  slug: "inheritance-slots-target",
  shortId: "inheritance-slots-target",
  name: "Wynn Calloway",
  pronouns: "they/them",
  level: 5,
  pathChoice: "balanced",
  activeArchetypeKey: "warrior",
  archetypes: [
    { archetypeKey: "warrior", rank: 2 },
    { archetypeKey: "mage", rank: 2 },
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

export const inheritanceSlotsTarget: E2EFixture = {
  seed,
  characterId: `seed-char-${seed.slug}`,
  url: `/c/${seed.shortId}`,
}

/** Deterministic `characterArchetype` row id for one of this target's
 *  Archetypes — the value an inherited slot's source points at. */
export function inheritanceTargetArchetypeId(archetypeKey: string): string {
  return archetypeId(seed.slug, archetypeKey)
}

/**
 * Clears every Archetype's slot configuration back to empty between tests so
 * each case starts from a clean board (the spec fills slots on the Warrior row).
 */
export async function resetInheritanceSlotsTarget(): Promise<void> {
  await getDb()
    .update(characterArchetypes)
    .set({ inheritanceSlots: [] })
    .where(
      eq(characterArchetypes.characterId, inheritanceSlotsTarget.characterId)
    )
}

/** Reads the Warrior row's persisted `inheritanceSlots` for assertions. */
export async function getWarriorInheritanceSlots() {
  const [row] = await getDb()
    .select({ inheritanceSlots: characterArchetypes.inheritanceSlots })
    .from(characterArchetypes)
    .where(eq(characterArchetypes.id, inheritanceTargetArchetypeId("warrior")))
    .limit(1)
  if (!row) throw new Error("inheritance-slots-target Warrior row missing")
  return row.inheritanceSlots
}
