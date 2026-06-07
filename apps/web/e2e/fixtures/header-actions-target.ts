import { eq } from "drizzle-orm"

import {
  computeMaxHP,
  computeMaxSP,
  toStatContext,
} from "@workspace/game/engine"

import { characters, getDb } from "@/lib/db"
import { loadHydratedCharacterById } from "@/lib/db/queries/load-character"

import { createTestCharacter, type CleanupTracker } from "./factory"

/**
 * Ephemeral target for `e2e/header-owner-actions.spec.ts` (UNN-155). Minted
 * per-run so the cast / write specs can mutate their rows in parallel without
 * flaking these pool-adjust assertions. Balanced path Warrior R1 — the active
 * Archetype is incidental; the spec only cares about the header's HP / SP /
 * Prisma columns.
 */
export async function createHeaderActionsTarget(tracker: CleanupTracker) {
  const target = await createTestCharacter(tracker, {
    name: "Elara Voss",
    pronouns: "she/her",
  })
  const { id } = target

  /** Resets pools to max HP / max SP and refills the Prisma flask. */
  async function reset(): Promise<void> {
    const character = await loadHydratedCharacterById(id)
    if (!character) throw new Error("header-actions target not present")
    const stats = toStatContext(character)
    await getDb()
      .update(characters)
      .set({
        currentHP: computeMaxHP(stats),
        currentSP: computeMaxSP(stats),
        prismaCharges: character.prismaMaxCharges,
      })
      .where(eq(characters.id, id))
  }

  /** Pokes `currentHP` directly — for the Fallen-at-0 assertion path. */
  async function setCurrentHP(hp: number): Promise<void> {
    await getDb()
      .update(characters)
      .set({ currentHP: hp })
      .where(eq(characters.id, id))
  }

  /** Pokes `prismaCharges` directly — for the disabled-at-0 assertion path. */
  async function setPrismaCharges(charges: number): Promise<void> {
    await getDb()
      .update(characters)
      .set({ prismaCharges: charges })
      .where(eq(characters.id, id))
  }

  /** Reads the persisted HP/SP/Prisma straight off the row. */
  async function getPools(): Promise<{
    currentHP: number
    currentSP: number
    prismaCharges: number
  }> {
    const [row] = await getDb()
      .select({
        currentHP: characters.currentHP,
        currentSP: characters.currentSP,
        prismaCharges: characters.prismaCharges,
      })
      .from(characters)
      .where(eq(characters.id, id))
      .limit(1)
    if (!row) throw new Error("header-actions target row missing")
    return row
  }

  return { ...target, reset, setCurrentHP, setPrismaCharges, getPools }
}
