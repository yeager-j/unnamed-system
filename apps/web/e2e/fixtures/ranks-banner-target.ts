import { makeSeedCharacter } from "@/lib/__fixtures__/seed-characters"

import type { E2EFixture } from "./types"

/**
 * Dedicated target for `e2e/ranks-banner.spec.ts` (UNN-255). Owned by the dev
 * user, with **2 Saved Archetype Ranks** so the sheet-wide Ranks banner shows
 * for the owner. The banner's dismissal is client-only `sessionStorage`, so the
 * spec never mutates the DB — but it still gets its own row so the rank count it
 * asserts can't be raced by the Atlas spec mutating `atlas-target` under
 * Playwright's `fullyParallel`.
 */
const seed = makeSeedCharacter({
  slug: "ranks-banner-target",
  shortId: "ranks-banner-target",
  name: "Wexley Trant",
  pronouns: "they/them",
  level: 12,
  savedArchetypeRanks: 2,
})

export const ranksBannerTarget: E2EFixture = {
  seed,
  characterId: `seed-char-${seed.slug}`,
  url: `/c/${seed.shortId}`,
}
