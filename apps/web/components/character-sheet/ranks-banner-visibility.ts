/** `sessionStorage` key for the Ranks-banner dismissal, scoped per character. */
export const dismissalStorageKey = (characterId: string) =>
  `ranks-banner-dismissed:${characterId}`

/**
 * Whether the Ranks banner should be visible, given the current Saved Archetype
 * Rank count and the count at which the owner last dismissed it this session.
 *
 * Visible only while ranks remain to spend *and* more ranks exist than there
 * were at dismissal. So spending to 0 hides it, a fresh grant above the
 * dismissed count re-surfaces it (overriding a prior dismissal), and dismissing
 * then spending — but staying above 0 — keeps it hidden.
 */
export function shouldShowRanksBanner(
  ranks: number,
  dismissedAtCount: number
): boolean {
  return ranks > 0 && ranks > dismissedAtCount
}
