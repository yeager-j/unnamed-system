import { and, eq } from "drizzle-orm"

import type { SeedCharacter } from "@/lib/__fixtures__/seed-characters"
import { characterArchetypes, getDb } from "@/lib/db"
import type { ValorState } from "@/lib/game/mechanics"

import type { E2EFixture } from "./types"

/**
 * Dedicated target for `e2e/valor.spec.ts` (UNN-227). Owned by the dev user;
 * active Archetype is Knight at Rank 1 with the Valor counter at 0. Lives in
 * its own row so the spec can ratchet the counter and assert the resulting
 * affinity flip without flaking `mechanics.spec.ts`, which pins seed-knight
 * at Valor 3.
 *
 * Knight base affinities: Slash → Resist innately, Fire → Weak. Pierce and
 * Strike are Neutral at the base, so they're the cleanest engine assertion:
 * they only flip to Resist via the Valor ≥ 3 effect.
 */
const seed: SeedCharacter = {
  slug: "valor-target",
  shortId: "valor-target",
  name: "Sera Olvin",
  pronouns: "she/her",
  level: 1,
  pathChoice: "balanced",
  activeArchetypeKey: "knight",
  archetypes: [
    {
      archetypeKey: "knight",
      rank: 1,
      mechanicState: { kind: "valor", value: 0 },
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

export const valorTarget: E2EFixture = {
  seed,
  characterId: `seed-char-${seed.slug}`,
  url: `/c/${seed.shortId}`,
}

/**
 * Resets the active Knight's Valor counter back to 0 between tests so each
 * case starts from a known baseline. Mirrors {@link resetCombatStateTarget}
 * for the per-Archetype mechanic-state column instead of the row's vitals.
 */
export async function resetValorTarget(): Promise<void> {
  await setValorTargetValue(0)
}

/** Pokes the Valor counter directly — used to set up clamp-at-max tests
 *  without burning seven clicks. */
export async function setValorTargetValue(value: number): Promise<void> {
  const state: ValorState = { kind: "valor", value }
  await getDb()
    .update(characterArchetypes)
    .set({ mechanicState: state })
    .where(
      and(
        eq(characterArchetypes.characterId, valorTarget.characterId),
        eq(characterArchetypes.archetypeKey, "knight")
      )
    )
}

/** Reads the persisted Valor value straight off the active Knight row. */
export async function getValorTargetValue(): Promise<number> {
  const [row] = await getDb()
    .select({ mechanicState: characterArchetypes.mechanicState })
    .from(characterArchetypes)
    .where(
      and(
        eq(characterArchetypes.characterId, valorTarget.characterId),
        eq(characterArchetypes.archetypeKey, "knight")
      )
    )
    .limit(1)
  if (!row) throw new Error("valor-target Knight archetype row missing")
  if (row.mechanicState?.kind !== "valor") {
    throw new Error("valor-target Knight row has non-Valor mechanic state")
  }
  return row.mechanicState.value
}
