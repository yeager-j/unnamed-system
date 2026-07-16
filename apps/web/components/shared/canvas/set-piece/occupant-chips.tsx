import type { ReactNode } from "react"

import { initials as initialsOf } from "@workspace/ui/lib/initials"
import { cn } from "@workspace/ui/lib/utils"

import { VitalBar } from "@/components/shared/vital-bar"
import type {
  SetPieceFaction,
  SetPieceOccupant,
} from "@/domain/map/view/set-piece-view"

/**
 * The occupant presentation shared by the set-piece card's tiers (§D3): faction
 * **pips** at Marquee, avatar **chips** at Stage, the **condensed stack** when a
 * Closeup crowd outgrows the footprint (§D7), and the full **token** at Closeup.
 * All read the one {@link SetPieceOccupant} shape the domain builders produce.
 * Owned tokens (the viewer's own, 0..n) take the gold treatment; the acting
 * combatant a white ring — the two never conflate.
 *
 * These are presentation-only. The card layer is `pointer-events-none`; any
 * tap-to-open interaction is wired by the surface wrapper around the Closeup slot,
 * which owns the stop-propagation rule.
 */

/** Cap for the at-a-glance rows — the inspector (P1c) always shows everyone. */
const OCCUPANT_CAP = 6

const factionDot: Record<SetPieceFaction, string> = {
  party: "bg-blue-500",
  hostile: "bg-red-500",
  neutral: "bg-muted-foreground",
}

const factionRing: Record<SetPieceFaction, string> = {
  party: "border-blue-700",
  hostile: "border-red-700",
  neutral: "border-muted-foreground/50",
}

/** The Closeup token's tint — border/bg + initials square — per faction. `owned`
 *  replaces the side tint with gold (matching today's watch); `acting` layers a
 *  white ring over it (the two are independent — your own token can be acting). */
const factionChip: Record<SetPieceFaction, { chip: string; initials: string }> =
  {
    party: {
      chip: "border-blue-700 bg-blue-700/10",
      initials: "bg-blue-700/20 text-blue-100",
    },
    hostile: {
      chip: "border-red-700 bg-red-700/10",
      initials: "bg-red-700/20 text-red-100",
    },
    neutral: {
      chip: "border-muted-foreground/40 bg-muted/20",
      initials: "bg-muted text-muted-foreground",
    },
  }
const OWNED_CHIP = {
  chip: "border-gold bg-gold/10",
  initials: "bg-gold/20 text-gold",
}
const ACTING_RING = "ring-2 ring-white ring-offset-1 ring-offset-card"

const dotClass = (o: SetPieceOccupant) =>
  o.owned ? "bg-gold" : factionDot[o.faction]

const ringClass = (o: SetPieceOccupant) =>
  o.owned ? "border-gold" : factionRing[o.faction]

/** Marquee: a row of faction-tinted pips (≤6) + a `+N` overflow count. */
export function OccupantPips({ occupants }: { occupants: SetPieceOccupant[] }) {
  if (occupants.length === 0) return null
  const shown = occupants.slice(0, OCCUPANT_CAP)
  const overflow = occupants.length - shown.length
  return (
    <div className="flex items-center gap-1">
      {shown.map((o) => (
        <span
          key={o.key}
          className={cn("size-2 rounded-full", dotClass(o))}
          aria-hidden
        />
      ))}
      {overflow > 0 ? (
        <span className="text-[0.65rem] font-medium text-muted-foreground tabular-nums">
          +{overflow}
        </span>
      ) : null}
    </div>
  )
}

/** Stage: a row of avatar chips (≤6, no names) — portrait when set, else initials. */
export function OccupantAvatars({
  occupants,
}: {
  occupants: SetPieceOccupant[]
}) {
  if (occupants.length === 0) return null
  const shown = occupants.slice(0, OCCUPANT_CAP)
  const overflow = occupants.length - shown.length
  return (
    <div className="flex items-center gap-1">
      {shown.map((o) => (
        <span
          key={o.key}
          title={o.name}
          className={cn(
            "flex size-6 items-center justify-center overflow-hidden rounded-full border bg-card text-[0.6rem] font-semibold",
            ringClass(o)
          )}
          aria-hidden
        >
          {o.portraitUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={o.portraitUrl}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            o.initials || initialsOf(o.name)
          )}
        </span>
      ))}
      {overflow > 0 ? (
        <span className="text-xs font-medium text-muted-foreground tabular-nums">
          +{overflow}
        </span>
      ) : null}
    </div>
  )
}

/**
 * The crowded-zone **condensed stack** (§D7): overlapping avatars (≤6) with a `+N`
 * overflow, the Closeup card's degraded roster when the occupants outgrow the
 * footprint's {@link import("@/domain/map/view/footprints").zoneTokenCapacity}. The
 * card-colored ring makes the overlap read as a stack; the full roster lives in the
 * inspector the always-visible "Open roster ▸" button opens. Presentation-only.
 */
export function CondensedAvatarStack({
  occupants,
}: {
  occupants: SetPieceOccupant[]
}) {
  if (occupants.length === 0) return null
  const shown = occupants.slice(0, OCCUPANT_CAP)
  const overflow = occupants.length - shown.length
  return (
    <div className="flex items-center">
      {shown.map((o, index) => (
        <span
          key={o.key}
          title={o.name}
          className={cn(
            "flex size-7 items-center justify-center overflow-hidden rounded-full border-2 bg-card text-[0.6rem] font-semibold ring-1 ring-card",
            index > 0 && "-ml-2",
            ringClass(o)
          )}
          aria-hidden
        >
          {o.portraitUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={o.portraitUrl}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            o.initials || initialsOf(o.name)
          )}
        </span>
      ))}
      {overflow > 0 ? (
        <span className="ml-1.5 text-xs font-medium text-muted-foreground tabular-nums">
          +{overflow}
        </span>
      ) : null}
    </div>
  )
}

/**
 * The Closeup roster token — the unified chip every surface renders (§D3): a
 * portrait/initials glyph + name, HP/SP {@link VitalBar}s when present, faction
 * tint (gold when owned), and the white acting ring. Presentation-only; the
 * surface wrapper supplies any tap-to-open shell (drawer, stats popover) around
 * it and owns the stop-propagation rule.
 */
export function OccupantToken({
  occupant,
  trailing,
  className,
}: {
  occupant: SetPieceOccupant
  /** A badge after the name — e.g. the combat acting sword. */
  trailing?: ReactNode
  className?: string
}) {
  const tint = occupant.owned ? OWNED_CHIP : factionChip[occupant.faction]
  return (
    <span
      className={cn(
        "inline-flex max-w-[10rem] flex-col gap-1 rounded-lg border px-1.5 py-1",
        tint.chip,
        occupant.acting && ACTING_RING,
        className
      )}
    >
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-none text-[0.6rem] font-semibold",
            tint.initials
          )}
        >
          {occupant.portraitUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={occupant.portraitUrl}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            occupant.initials || initialsOf(occupant.name)
          )}
        </span>
        <span className="truncate text-xs font-medium">{occupant.name}</span>
        {trailing}
      </span>
      {occupant.hp ? (
        <VitalBar
          current={occupant.hp.current}
          max={occupant.hp.max}
          kind="hp"
        />
      ) : null}
      {occupant.sp ? (
        <VitalBar
          current={occupant.sp.current}
          max={occupant.sp.max}
          kind="sp"
        />
      ) : null}
    </span>
  )
}

/**
 * Partition occupants into melee clusters for the Closeup roster: each
 * multi-member `engagementGroup` becomes one bucket, and every ungrouped occupant
 * (a Free singleton) is its own bucket. Input order is preserved. The surface
 * wrapper renders each multi-member bucket inside its dashed "engaged" outline.
 */
export function clustersOf(
  occupants: SetPieceOccupant[]
): SetPieceOccupant[][] {
  const clusters: SetPieceOccupant[][] = []
  const byGroup = new Map<number, SetPieceOccupant[]>()
  for (const occupant of occupants) {
    if (occupant.engagementGroup === undefined) {
      clusters.push([occupant])
      continue
    }
    const existing = byGroup.get(occupant.engagementGroup)
    if (existing) {
      existing.push(occupant)
    } else {
      const bucket = [occupant]
      byGroup.set(occupant.engagementGroup, bucket)
      clusters.push(bucket)
    }
  }
  return clusters
}
