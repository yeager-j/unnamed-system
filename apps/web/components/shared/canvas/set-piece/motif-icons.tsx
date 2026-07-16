import {
  CubeIcon,
  DiamondIcon,
  FlameIcon,
  GearSixIcon,
  SkullIcon,
  StairsIcon,
  WavesIcon,
} from "@phosphor-icons/react/dist/ssr"
import type { ComponentType } from "react"

import type { ZoneMotif } from "@/domain/map/view/set-piece-view"

/**
 * The zone-motif glyph registry (Dungeon Visual Overhaul §D9) — one icon per
 * authored motif, rendered on the set-piece card's Marquee/Stage headers. We
 * prefer **Phosphor** (the app's icon library) wherever it carries a faithful
 * match for the handoff's drawn glyph; only `statue`/`cell`/`tomb` have no
 * Phosphor equivalent and are vendored as small stroke `<svg>`s matching the
 * handoff's line-art aesthetic (viewBox `-2 -2 28 28`, 2px round strokes).
 * Extending the motif set is an enum member + a registry entry — a PR, not an
 * authoring surface.
 */

type Glyph = ComponentType<{ className?: string }>

const strokeProps = {
  viewBox: "-2 -2 28 28",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
}

/** A bust on a plinth — no faithful Phosphor match. */
function StatueGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} {...strokeProps} aria-hidden>
      <circle cx="12" cy="6" r="3" />
      <path d="M7 21c0-6 2-9 5-9s5 3 5 9" />
    </svg>
  )
}

/** Prison bars — Phosphor has no `Prison`/`Cell`. */
function CellGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} {...strokeProps} aria-hidden>
      <path d="M6 3v18M12 3v18M18 3v18M4 8h16M4 16h16" />
    </svg>
  )
}

/** An arched headstone with a cross — Phosphor has no `Tombstone`/`Coffin`. */
function TombGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} {...strokeProps} aria-hidden>
      <path d="M6 21V10a6 6 0 0 1 12 0v11" />
      <path d="M4 21h16M12 8v7M9 11h6" />
    </svg>
  )
}

export const MOTIF_GLYPHS: Record<ZoneMotif, Glyph> = {
  water: WavesIcon,
  stair: StairsIcon,
  bones: SkullIcon,
  statue: StatueGlyph,
  altar: FlameIcon,
  treasure: DiamondIcon,
  crates: CubeIcon,
  cell: CellGlyph,
  mechanism: GearSixIcon,
  tomb: TombGlyph,
}

/**
 * The route glyph — two nodes joined by a dashed hop, vendored from the handoff's
 * `mi-route` (§D5). Keyed to nothing: it's the range-lens badge's register, kept
 * out of {@link MOTIF_GLYPHS} (typed to {@link ZoneMotif}) so a hop is never
 * mistakable for a zone motif.
 */
export function RouteGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} {...strokeProps} aria-hidden>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M6 8v2a5 5 0 0 0 5 5h3" strokeDasharray="2.5 2.5" />
    </svg>
  )
}

/** The glyph for a motif, or `null` when a zone has none (name-only header). */
export function MotifGlyph({
  motif,
  className,
}: {
  motif: ZoneMotif | undefined
  className?: string
}) {
  if (!motif) return null
  const Glyph = MOTIF_GLYPHS[motif]
  return <Glyph className={className} />
}
