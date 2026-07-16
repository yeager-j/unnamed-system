/**
 * Whether the viewer asked the OS to minimize motion — the canvas honors it for
 * every scripted camera ease (the zoom cluster's fit-view, the dungeon
 * click-to-center), matching the tier-crossfade CSS. SSR-guarded so it's safe to
 * read during render (no `matchMedia` on the server).
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}
