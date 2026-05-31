import { eq } from "drizzle-orm"

import { makeSeedCharacter } from "@/lib/__fixtures__/seed-characters"
import { characters, getDb } from "@/lib/db"
import {
  DEFAULT_BATTLE_CONDITIONS,
  type Ailments,
  type BattleConditions,
} from "@/lib/game/character"

import type { E2EFixture } from "./types"

/**
 * Dedicated target for `e2e/combat-state.spec.ts` (UNN-226). Lives in its
 * own row so the cast / write / rest / header-actions specs can mutate
 * their seed rows in parallel without flaking these Combat State assertions.
 * Balanced Warrior R1 — the active Archetype is incidental; the spec only
 * cares about the `ailments`, `battleConditions`, and `exhaustion` columns.
 */
const seed = makeSeedCharacter({
  slug: "combat-state-target",
  shortId: "combat-state-target",
  name: "Soren Halvik",
})

export const combatStateTarget: E2EFixture = {
  seed,
  characterId: `seed-char-${seed.slug}`,
  url: `/c/${seed.shortId}`,
}

/**
 * Resets the three Combat State columns the spec edits — Ailments cleared,
 * Battle Conditions back to the all-neutral default, Exhaustion zeroed.
 * Each test calls this in `beforeEach` so a state left over from a prior
 * test doesn't poison the next assertion.
 */
export async function resetCombatStateTarget(): Promise<void> {
  await getDb()
    .update(characters)
    .set({
      ailments: [],
      battleConditions: DEFAULT_BATTLE_CONDITIONS,
      exhaustion: 0,
    })
    .where(eq(characters.id, combatStateTarget.characterId))
}

/** Seeds a specific starting state for tests that need a non-default baseline. */
export async function setCombatStateTargetState(state: {
  ailments?: Ailments
  battleConditions?: BattleConditions
  exhaustion?: number
}): Promise<void> {
  await getDb()
    .update(characters)
    .set(state)
    .where(eq(characters.id, combatStateTarget.characterId))
}

/** Reads the persisted Combat State columns straight off the row. */
export async function getCombatStateTargetState(): Promise<{
  ailments: Ailments
  battleConditions: BattleConditions | null
  exhaustion: number
}> {
  const [row] = await getDb()
    .select({
      ailments: characters.ailments,
      battleConditions: characters.battleConditions,
      exhaustion: characters.exhaustion,
    })
    .from(characters)
    .where(eq(characters.id, combatStateTarget.characterId))
    .limit(1)
  if (!row) throw new Error("combat-state-target row missing")
  return row
}
