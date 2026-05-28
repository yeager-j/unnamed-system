import { and, eq } from "drizzle-orm"

import type { SeedCharacter } from "@/lib/__fixtures__/seed-characters"
import { characterArchetypes, getDb } from "@/lib/db"
import type { PerfectionState } from "@/lib/game/mechanics"

import type { E2EFixture } from "./types"

/**
 * Dedicated target for `e2e/perfection.spec.ts` (UNN-228). Owned by the
 * dev user; active Archetype is Warrior at Rank 1 with the Perfection
 * counter at D (rank 0). Lives in its own row so the spec can ratchet
 * Perfection up and down — and Reset — without flaking `mechanics.spec.ts`,
 * which pins `seed-warrior` at Perfection A.
 *
 * Warrior gives Strength +2, so the engine assertion targets Cleave's
 * Attack Roll readout: Strength (+2) + Perfection (B) (+2) = +4 once
 * the rank climbs.
 */
const seed: SeedCharacter = {
  slug: "perfection-target",
  shortId: "perfection-target",
  name: "Tarek Vance",
  pronouns: "he/him",
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
  items: [],
  victories: 0,
  virtues: { expression: 0, empathy: 0, wisdom: 0, focus: 0 },
  sparkLog: [],
  exhaustion: 0,
  ailments: [],
  battleConditions: null,
  partyComposition: null,
}

export const perfectionTarget: E2EFixture = {
  seed,
  characterId: `seed-char-${seed.slug}`,
  url: `/c/${seed.shortId}`,
}

/** Resets the active Warrior's Perfection counter back to D between tests. */
export async function resetPerfectionTarget(): Promise<void> {
  await setPerfectionTargetRank(0)
}

/** Pokes the Perfection rank directly — used to set up the clamp-at-S case
 *  without burning four clicks. */
export async function setPerfectionTargetRank(rank: number): Promise<void> {
  const state: PerfectionState = { kind: "perfection", rank }
  await getDb()
    .update(characterArchetypes)
    .set({ mechanicState: state })
    .where(
      and(
        eq(characterArchetypes.characterId, perfectionTarget.characterId),
        eq(characterArchetypes.archetypeKey, "warrior")
      )
    )
}

/** Reads the persisted Perfection rank straight off the active Warrior row. */
export async function getPerfectionTargetRank(): Promise<number> {
  const [row] = await getDb()
    .select({ mechanicState: characterArchetypes.mechanicState })
    .from(characterArchetypes)
    .where(
      and(
        eq(characterArchetypes.characterId, perfectionTarget.characterId),
        eq(characterArchetypes.archetypeKey, "warrior")
      )
    )
    .limit(1)
  if (!row) throw new Error("perfection-target Warrior archetype row missing")
  if (row.mechanicState?.kind !== "perfection") {
    throw new Error(
      "perfection-target Warrior row has non-Perfection mechanic state"
    )
  }
  return row.mechanicState.rank
}
