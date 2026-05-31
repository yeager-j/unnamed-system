import { and, eq } from "drizzle-orm"

import { makeSeedCharacter } from "@/lib/__fixtures__/seed-characters"
import { characterArchetypes, getDb } from "@/lib/db"
import type { PathOfDawnState } from "@/lib/game/mechanics"

import type { E2EFixture } from "./types"

/**
 * Dedicated target for `e2e/path-of-dawn.spec.ts` (UNN-230). Owned by the dev
 * user; active Archetype is Healer with Dawn Mode off. Lives in its own row so
 * the spec can toggle Dawn Mode without flaking the showcase `seed-healer`,
 * which `mechanics.spec.ts` pins to Dawn Mode on.
 */
const seed = makeSeedCharacter({
  slug: "path-of-dawn-target",
  shortId: "path-of-dawn-target",
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

export const pathOfDawnTarget: E2EFixture = {
  seed,
  characterId: `seed-char-${seed.slug}`,
  url: `/c/${seed.shortId}`,
}

/** Resets Dawn Mode to off so each test starts from a known baseline. */
export async function resetPathOfDawnTarget(): Promise<void> {
  await setPathOfDawnTargetDawnMode(false)
}

/** Pokes the Dawn Mode flag directly. */
export async function setPathOfDawnTargetDawnMode(
  dawnMode: boolean
): Promise<void> {
  const state: PathOfDawnState = { kind: "path-of-dawn", dawnMode }
  await getDb()
    .update(characterArchetypes)
    .set({ mechanicState: state })
    .where(
      and(
        eq(characterArchetypes.characterId, pathOfDawnTarget.characterId),
        eq(characterArchetypes.archetypeKey, "healer")
      )
    )
}

/** Reads the persisted Dawn Mode flag straight off the active Healer row. */
export async function getPathOfDawnTargetDawnMode(): Promise<boolean> {
  const [row] = await getDb()
    .select({ mechanicState: characterArchetypes.mechanicState })
    .from(characterArchetypes)
    .where(
      and(
        eq(characterArchetypes.characterId, pathOfDawnTarget.characterId),
        eq(characterArchetypes.archetypeKey, "healer")
      )
    )
    .limit(1)
  if (!row) throw new Error("path-of-dawn-target Healer archetype row missing")
  if (row.mechanicState?.kind !== "path-of-dawn") {
    throw new Error("path-of-dawn-target Healer row has non-Path-of-Dawn state")
  }
  return row.mechanicState.dawnMode
}
