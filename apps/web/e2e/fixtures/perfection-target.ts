import { and, eq } from "drizzle-orm"

import type { PerfectionState } from "@workspace/game/mechanics"

import { characterArchetypes, getDb } from "@/lib/db"

import { createTestCharacter, type CleanupTracker } from "./factory"

/**
 * Ephemeral target for `e2e/perfection.spec.ts` (UNN-228). Active Archetype is
 * Warrior at Rank 1 with the Perfection counter at D (rank 0). Minted per-run so
 * the spec can ratchet Perfection up/down — and Reset — without racing.
 *
 * Warrior gives Strength +2, so the engine assertion targets Cleave's Attack
 * Roll readout: Strength (+2) + Perfection (B) (+2) = +4 once the rank climbs.
 */
export async function createPerfectionTarget(tracker: CleanupTracker) {
  const target = await createTestCharacter(tracker, {
    name: "Tarek Vance",
    pronouns: "he/him",
  })
  const { id } = target

  /** Pokes the Perfection rank directly — used to set up the clamp-at-S case
   *  without burning four clicks. */
  async function setRank(rank: number): Promise<void> {
    const state: PerfectionState = { kind: "perfection", rank }
    await getDb()
      .update(characterArchetypes)
      .set({ mechanicState: state })
      .where(
        and(
          eq(characterArchetypes.characterId, id),
          eq(characterArchetypes.archetypeKey, "warrior")
        )
      )
  }

  /** Resets the active Warrior's Perfection counter back to D between tests. */
  async function reset(): Promise<void> {
    await setRank(0)
  }

  /** Reads the persisted Perfection rank straight off the active Warrior row. */
  async function getRank(): Promise<number> {
    const [row] = await getDb()
      .select({ mechanicState: characterArchetypes.mechanicState })
      .from(characterArchetypes)
      .where(
        and(
          eq(characterArchetypes.characterId, id),
          eq(characterArchetypes.archetypeKey, "warrior")
        )
      )
      .limit(1)
    if (!row) throw new Error("perfection target Warrior archetype row missing")
    if (row.mechanicState?.kind !== "perfection") {
      throw new Error(
        "perfection target Warrior row has non-Perfection mechanic state"
      )
    }
    return row.mechanicState.rank
  }

  return { ...target, reset, setRank, getRank }
}
