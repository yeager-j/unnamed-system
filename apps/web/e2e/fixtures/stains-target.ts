import { and, eq } from "drizzle-orm"

import { STAIN_SLOT_COUNT, type StainsState } from "@workspace/game/mechanics"

import { characterArchetypes, getDb } from "@/lib/db"

import { createTestCharacter, type CleanupTracker } from "./factory"

type Tokens = StainsState["tokens"]

const EMPTY_TOKENS: Tokens = Array.from(
  { length: STAIN_SLOT_COUNT },
  () => null
)

/**
 * Ephemeral target for `e2e/stains.spec.ts` (UNN-229). Active Archetype is Mage
 * at Rank 1 with all four Stain slots empty. Minted per-run so the spec can
 * add / replace / remove / clear Stains without racing the showcase `seed-mage`.
 */
export async function createStainsTarget(tracker: CleanupTracker) {
  const target = await createTestCharacter(tracker, {
    name: "Iris Quenneville",
    activeArchetypeKey: "mage",
    archetypes: [
      {
        archetypeKey: "mage",
        rank: 1,
        mechanicState: { kind: "stains", tokens: EMPTY_TOKENS },
      },
    ],
  })
  const { id } = target

  /** Pokes the Stain slots directly — used to set up the full / replace cases
   *  without clicking through four adds. */
  async function setTokens(tokens: Tokens): Promise<void> {
    const state: StainsState = { kind: "stains", tokens }
    await getDb()
      .update(characterArchetypes)
      .set({ mechanicState: state })
      .where(
        and(
          eq(characterArchetypes.characterId, id),
          eq(characterArchetypes.archetypeKey, "mage")
        )
      )
  }

  /** Resets every slot to empty so each test starts from a known baseline. */
  async function reset(): Promise<void> {
    await setTokens(EMPTY_TOKENS)
  }

  /** Reads the persisted Stain tokens straight off the active Mage row. */
  async function getTokens(): Promise<Tokens> {
    const [row] = await getDb()
      .select({ mechanicState: characterArchetypes.mechanicState })
      .from(characterArchetypes)
      .where(
        and(
          eq(characterArchetypes.characterId, id),
          eq(characterArchetypes.archetypeKey, "mage")
        )
      )
      .limit(1)
    if (!row) throw new Error("stains target Mage archetype row missing")
    if (row.mechanicState?.kind !== "stains") {
      throw new Error("stains target Mage row has non-Stains mechanic state")
    }
    return row.mechanicState.tokens
  }

  return { ...target, reset, setTokens, getTokens }
}
