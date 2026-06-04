/**
 * Resolves an avatar image src: the uploaded `portraitUrl` when present, else a
 * Vercel-hosted SVG avatar deterministically derived from `seed`. The fallback
 * service keeps unportraited rosters visually varied without shipping
 * placeholder art, and a stable `seed` (a name, or an id for the nameless) gives
 * every subject the same gradient every render.
 *
 * Shared by the My Characters card and the combat console's rail/drawer tokens
 * so the portrait-or-gradient rule lives in one place.
 */
export function avatarSrc(
  portraitUrl: string | null | undefined,
  seed: string
): string {
  if (portraitUrl) return portraitUrl
  return `https://avatar.vercel.sh/${encodeURIComponent(seed)}`
}
