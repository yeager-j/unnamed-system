import { eq } from "drizzle-orm"

import {
  DEFAULT_BATTLE_CONDITIONS,
  type Ailments,
  type BattleConditions,
} from "@workspace/game/foundation"

import { characters, getDb } from "@/lib/db"

import { createTestCharacter, type CleanupTracker } from "./factory"

/**
 * Ephemeral target for `e2e/combat-state.spec.ts` (UNN-226). A balanced Warrior
 * R1 — the active Archetype is incidental; the spec only cares about the
 * `ailments`, `battleConditions`, and `exhaustion` columns. Minted per-run via
 * the factory and torn down in `afterAll`, so nothing it edits can race a
 * parallel worker.
 */
export async function createCombatStateTarget(tracker: CleanupTracker) {
  const target = await createTestCharacter(tracker, { name: "Soren Halvik" })
  const { id } = target

  /** Resets the three Combat State columns — Ailments cleared, Battle
   *  Conditions back to all-neutral, Exhaustion zeroed. */
  async function reset(): Promise<void> {
    await getDb()
      .update(characters)
      .set({
        ailments: [],
        battleConditions: DEFAULT_BATTLE_CONDITIONS,
        exhaustion: 0,
      })
      .where(eq(characters.id, id))
  }

  /** Seeds a specific starting state for tests that need a non-default baseline. */
  async function setState(state: {
    ailments?: Ailments
    battleConditions?: BattleConditions
    exhaustion?: number
  }): Promise<void> {
    await getDb().update(characters).set(state).where(eq(characters.id, id))
  }

  /** Reads the persisted Combat State columns straight off the row. */
  async function getState(): Promise<{
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
      .where(eq(characters.id, id))
      .limit(1)
    if (!row) throw new Error("combat-state target row missing")
    return row
  }

  return { ...target, reset, setState, getState }
}
