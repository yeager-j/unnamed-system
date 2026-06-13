import { and, eq } from "drizzle-orm"

import { type FrenzyState } from "@workspace/game/foundation"

import { characterArchetypes, getDb } from "@/lib/db"

import { createTestCharacter, type CleanupTracker } from "./factory"

/**
 * Ephemeral target for `e2e/frenzy.spec.ts`. Active Archetype is Berserker at
 * Rank 5 (so the full Skill list — including the Strike Skill the bonus assertion
 * opens — is unlocked) with the Pain Meter at 0 and Frenzy Mode off. Minted
 * per-run so the spec can ratchet Pain and toggle Mode without racing any other
 * worker.
 */
export async function createFrenzyTarget(tracker: CleanupTracker) {
  const target = await createTestCharacter(tracker, {
    name: "Bjorn Frenzy",
    pronouns: "he/him",
    activeArchetypeKey: "berserker",
    archetypes: [
      {
        archetypeKey: "berserker",
        rank: 5,
        mechanicState: { kind: "frenzy", pain: 0, frenzyMode: false },
      },
    ],
  })
  const { id } = target

  /** Pokes the Frenzy state directly — used to set up the clamp-at-max test
   *  without burning five clicks. */
  async function setState(state: FrenzyState): Promise<void> {
    await getDb()
      .update(characterArchetypes)
      .set({ mechanicState: state })
      .where(
        and(
          eq(characterArchetypes.characterId, id),
          eq(characterArchetypes.archetypeKey, "berserker")
        )
      )
  }

  /** Resets the active Berserker's Frenzy state to 0 Pain / Mode off. */
  async function reset(): Promise<void> {
    await setState({ kind: "frenzy", pain: 0, frenzyMode: false })
  }

  /** Reads the persisted Frenzy state straight off the active Berserker row. */
  async function getState(): Promise<FrenzyState> {
    const [row] = await getDb()
      .select({ mechanicState: characterArchetypes.mechanicState })
      .from(characterArchetypes)
      .where(
        and(
          eq(characterArchetypes.characterId, id),
          eq(characterArchetypes.archetypeKey, "berserker")
        )
      )
      .limit(1)
    if (!row) throw new Error("frenzy target Berserker archetype row missing")
    if (row.mechanicState?.kind !== "frenzy") {
      throw new Error(
        "frenzy target Berserker row has non-Frenzy mechanic state"
      )
    }
    return row.mechanicState
  }

  /** The persisted Pain value alone — the common `expect.poll` witness. */
  async function getPain(): Promise<number> {
    return (await getState()).pain
  }

  return { ...target, reset, setState, getState, getPain }
}
