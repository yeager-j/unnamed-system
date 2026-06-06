import { and, eq } from "drizzle-orm"

import { type PathOfDawnState } from "@workspace/game/engine"

import { characterArchetypes, getDb } from "@/lib/db"

import { createTestCharacter, type CleanupTracker } from "./factory"

/**
 * Ephemeral target for `e2e/path-of-dawn.spec.ts` (UNN-230). Active Archetype is
 * Healer with Dawn Mode off. Minted per-run so the spec can toggle Dawn Mode
 * without racing the showcase `seed-healer`.
 */
export async function createPathOfDawnTarget(tracker: CleanupTracker) {
  const target = await createTestCharacter(tracker, {
    name: "Brother Cael",
    pronouns: "he/him",
    pathChoice: "skill-focused",
    activeArchetypeKey: "healer",
    archetypes: [
      {
        archetypeKey: "healer",
        rank: 1,
        mechanicState: { kind: "path-of-dawn", dawnMode: false },
      },
    ],
  })
  const { id } = target

  /** Pokes the Dawn Mode flag directly. */
  async function setDawnMode(dawnMode: boolean): Promise<void> {
    const state: PathOfDawnState = { kind: "path-of-dawn", dawnMode }
    await getDb()
      .update(characterArchetypes)
      .set({ mechanicState: state })
      .where(
        and(
          eq(characterArchetypes.characterId, id),
          eq(characterArchetypes.archetypeKey, "healer")
        )
      )
  }

  /** Resets Dawn Mode to off so each test starts from a known baseline. */
  async function reset(): Promise<void> {
    await setDawnMode(false)
  }

  /** Reads the persisted Dawn Mode flag straight off the active Healer row. */
  async function getDawnMode(): Promise<boolean> {
    const [row] = await getDb()
      .select({ mechanicState: characterArchetypes.mechanicState })
      .from(characterArchetypes)
      .where(
        and(
          eq(characterArchetypes.characterId, id),
          eq(characterArchetypes.archetypeKey, "healer")
        )
      )
      .limit(1)
    if (!row)
      throw new Error("path-of-dawn target Healer archetype row missing")
    if (row.mechanicState?.kind !== "path-of-dawn") {
      throw new Error(
        "path-of-dawn target Healer row has non-Path-of-Dawn state"
      )
    }
    return row.mechanicState.dawnMode
  }

  return { ...target, reset, setDawnMode, getDawnMode }
}
