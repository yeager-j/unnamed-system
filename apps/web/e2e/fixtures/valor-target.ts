import { and, eq } from "drizzle-orm"

import type { ValorState } from "@workspace/game/mechanics"

import { characterArchetypes, getDb } from "@/lib/db"

import { createTestCharacter, type CleanupTracker } from "./factory"

/**
 * Ephemeral target for `e2e/valor.spec.ts` (UNN-227). Active Archetype is Knight
 * at Rank 1 with the Valor counter at 0. Minted per-run so the spec can ratchet
 * the counter and assert the resulting affinity flip without racing any other
 * worker.
 *
 * Knight base affinities: Slash → Resist innately, Fire → Weak. Pierce and
 * Strike are Neutral at the base, so they're the cleanest engine assertion:
 * they only flip to Resist via the Valor ≥ 3 effect.
 */
export async function createValorTarget(tracker: CleanupTracker) {
  const target = await createTestCharacter(tracker, {
    name: "Sera Olvin",
    pronouns: "she/her",
    activeArchetypeKey: "knight",
    archetypes: [
      {
        archetypeKey: "knight",
        rank: 1,
        mechanicState: { kind: "valor", value: 0 },
      },
    ],
  })
  const { id } = target

  /** Pokes the Valor counter directly — used to set up clamp-at-max tests
   *  without burning seven clicks. */
  async function setValue(value: number): Promise<void> {
    const state: ValorState = { kind: "valor", value }
    await getDb()
      .update(characterArchetypes)
      .set({ mechanicState: state })
      .where(
        and(
          eq(characterArchetypes.characterId, id),
          eq(characterArchetypes.archetypeKey, "knight")
        )
      )
  }

  /** Resets the active Knight's Valor counter back to 0 between tests. */
  async function reset(): Promise<void> {
    await setValue(0)
  }

  /** Reads the persisted Valor value straight off the active Knight row. */
  async function getValue(): Promise<number> {
    const [row] = await getDb()
      .select({ mechanicState: characterArchetypes.mechanicState })
      .from(characterArchetypes)
      .where(
        and(
          eq(characterArchetypes.characterId, id),
          eq(characterArchetypes.archetypeKey, "knight")
        )
      )
      .limit(1)
    if (!row) throw new Error("valor target Knight archetype row missing")
    if (row.mechanicState?.kind !== "valor") {
      throw new Error("valor target Knight row has non-Valor mechanic state")
    }
    return row.mechanicState.value
  }

  return { ...target, reset, setValue, getValue }
}
