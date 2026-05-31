import { and, eq } from "drizzle-orm"

import { makeSeedCharacter } from "@/lib/__fixtures__/seed-characters"
import { characterArchetypes, getDb } from "@/lib/db"
import { STAIN_SLOT_COUNT, type StainsState } from "@/lib/game/mechanics"

import type { E2EFixture } from "./types"

type Tokens = StainsState["tokens"]

const EMPTY_TOKENS: Tokens = Array.from(
  { length: STAIN_SLOT_COUNT },
  () => null
)

/**
 * Dedicated target for `e2e/stains.spec.ts` (UNN-229). Owned by the dev user;
 * active Archetype is Mage at Rank 1 with all four Stain slots empty. Lives in
 * its own row so the spec can add / replace / remove / clear Stains without
 * flaking the showcase `seed-mage`, which `mechanics.spec.ts` pins to a fixed
 * Fire / Ice loadout.
 */
const seed = makeSeedCharacter({
  slug: "stains-target",
  shortId: "stains-target",
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

export const stainsTarget: E2EFixture = {
  seed,
  characterId: `seed-char-${seed.slug}`,
  url: `/c/${seed.shortId}`,
}

/** Resets every slot to empty so each test starts from a known baseline. */
export async function resetStainsTarget(): Promise<void> {
  await setStainsTargetTokens(EMPTY_TOKENS)
}

/** Pokes the Stain slots directly — used to set up the full / replace cases
 *  without clicking through four adds. */
export async function setStainsTargetTokens(tokens: Tokens): Promise<void> {
  const state: StainsState = { kind: "stains", tokens }
  await getDb()
    .update(characterArchetypes)
    .set({ mechanicState: state })
    .where(
      and(
        eq(characterArchetypes.characterId, stainsTarget.characterId),
        eq(characterArchetypes.archetypeKey, "mage")
      )
    )
}

/** Reads the persisted Stain tokens straight off the active Mage row. */
export async function getStainsTargetTokens(): Promise<Tokens> {
  const [row] = await getDb()
    .select({ mechanicState: characterArchetypes.mechanicState })
    .from(characterArchetypes)
    .where(
      and(
        eq(characterArchetypes.characterId, stainsTarget.characterId),
        eq(characterArchetypes.archetypeKey, "mage")
      )
    )
    .limit(1)
  if (!row) throw new Error("stains-target Mage archetype row missing")
  if (row.mechanicState?.kind !== "stains") {
    throw new Error("stains-target Mage row has non-Stains mechanic state")
  }
  return row.mechanicState.tokens
}
