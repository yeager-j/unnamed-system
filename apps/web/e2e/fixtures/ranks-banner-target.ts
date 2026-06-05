import { createTestCharacter, type CleanupTracker } from "./factory"

/**
 * Ephemeral target for `e2e/ranks-banner.spec.ts` (UNN-255). Has 2 Saved
 * Archetype Ranks so the sheet-wide Ranks banner shows for the owner. Read-only
 * (dismissal is client `sessionStorage`), but minted per-run so the asserted
 * rank count can't be raced by the Atlas spec.
 */
export function createRanksBannerTarget(tracker: CleanupTracker) {
  return createTestCharacter(tracker, {
    name: "Wexley Trant",
    pronouns: "they/them",
    level: 12,
    savedArchetypeRanks: 2,
  })
}
