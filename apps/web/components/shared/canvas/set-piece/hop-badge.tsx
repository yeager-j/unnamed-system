import { StarIcon } from "@phosphor-icons/react/dist/ssr"

import { cn } from "@workspace/ui/lib/utils"

import type { ZoneSetPieceHop } from "@/domain/map/view/set-piece-view"

import { RouteGlyph } from "./motif-icons"

/**
 * The range-lens badge (Dungeon Visual Overhaul §D5) — the title-row register that
 * tells how many zones a room sits from the lens origin. A distinct home from the
 * combat move affordances (toolbar buttons) and the acting mark (white ring), so the
 * always-on lens composes with combat unchanged.
 *
 * It is never mistakable for a count: the route glyph carries "hops", and distance
 * rides **opacity** (nearer = brighter), not size or color. The **origin** zone wears
 * a gold `★` instead — its own route glyph suppressed — matching the party keyline's
 * gold (the one place the lens spends the rationed gold, and only when the origin is
 * the party's zone). `hop === null` ⇒ unreachable ⇒ no badge at all.
 */

const DISTANCE_OPACITY = [1, 1, 0.86, 0.72, 0.6] as const

function opacityForLabel(label: string): number {
  const distance = Number(label)
  if (!Number.isFinite(distance)) return 1
  return DISTANCE_OPACITY[Math.min(distance, 4)] ?? 0.6
}

export function HopBadge({ hop }: { hop: ZoneSetPieceHop | null }) {
  if (hop === null) return null

  if (hop.origin) {
    return (
      <span
        aria-label={hop.label ? `${hop.label} is here` : "Range lens origin"}
        className="inline-flex flex-none items-center gap-1 rounded-full border border-gold bg-gold px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap text-background"
      >
        <StarIcon weight="fill" className="size-2.5" aria-hidden />
        {hop.label}
      </span>
    )
  }

  const distance = Number(hop.label)
  return (
    <span
      aria-label={`${hop.label} ${distance === 1 ? "zone" : "zones"} away`}
      style={{ opacity: opacityForLabel(hop.label) }}
      className={cn(
        "inline-flex flex-none items-center gap-1 rounded-full border border-white/20 bg-black/25 px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap text-muted-foreground"
      )}
    >
      <RouteGlyph className="size-2.5" />
      {hop.label}
    </span>
  )
}
