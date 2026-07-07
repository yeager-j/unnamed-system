import { eq } from "drizzle-orm"

import type { Virtues } from "@workspace/game-v2/virtues"

import { entity, getDb } from "@/lib/db"

import { createTestCharacter, type CleanupTracker } from "./factory"

/**
 * Ephemeral target for `e2e/character-sparks.spec.ts` (UNN-558): the Spark
 * loop + Talent learning on the Explore tab. Minted at **6 of 7 Sparks** with
 * Expression absent from the log, so one Add Spark fills it and the forced
 * rank-up dialog's eligibility filter (in-log Virtues only) is assertable.
 * No player-gained Talents, so the Add → Remove round-trip starts clean.
 */
export async function createSparkTarget(tracker: CleanupTracker) {
  const target = await createTestCharacter(tracker, {
    name: "Spark Bard",
    activeArchetypeKey: "healer",
    archetypes: [{ archetypeKey: "healer", rank: 2 }],
    virtues: { expression: 0, empathy: 1, wisdom: 2, focus: 1 },
    sparkLog: ["wisdom", "wisdom", "empathy", "focus", "wisdom", "empathy"],
    gainedTalents: [],
  })

  /** Reads the persisted `virtues` component (ranks + Spark log). */
  async function getVirtues(): Promise<Virtues | null> {
    const rows = await getDb()
      .select({ virtues: entity.virtues })
      .from(entity)
      .where(eq(entity.id, target.id))
    return rows[0]?.virtues ?? null
  }

  /** Reads the persisted player-gained Talent keys. */
  async function getTalentKeys(): Promise<string[]> {
    const rows = await getDb()
      .select({ talents: entity.talents })
      .from(entity)
      .where(eq(entity.id, target.id))
    return (rows[0]?.talents ?? []).map(({ key }) => key)
  }

  return { ...target, getVirtues, getTalentKeys }
}
