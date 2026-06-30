"use client"

import type { ReactNode } from "react"

import { type Pool } from "@workspace/game/engine"
import { cn } from "@workspace/ui/lib/utils"

import { TokenGlyph } from "@/components/dungeon/canvas/token-glyph"
import {
  TOKEN_ACTING_RING,
  TOKEN_OWNED_STYLE,
  TOKEN_SIDE_STYLES,
  type TokenSide,
} from "@/components/dungeon/canvas/token-styles"
import { VitalBar } from "@/components/shared/vital-bar"

/**
 * The shared token chip on the dungeon canvas — a side-tinted square glyph + name,
 * with an optional {@link VitalBar} stack and a trailing badge slot. The combat,
 * exploration, and watch chips are all this shell with different props; the
 * side/highlight styling lives once in
 * {@link import("@/components/dungeon/canvas/token-styles").TOKEN_SIDE_STYLES}.
 *
 * Presentational only (serializable props) — the owning zone node wires any
 * tap-to-open interaction through its context. The Setup chip is **not** built on
 * this shell (it's a horizontal toggle with no vitals) but shares the same tint map.
 */
export function TokenChip({
  side,
  name,
  portraitUrl,
  hp,
  sp,
  owned = false,
  acting = false,
  trailing,
}: {
  side: TokenSide
  name: string
  portraitUrl?: string | null
  hp?: Pool
  sp?: Pool | null
  /** The watch viewer's own character — a gold self-tint (replaces the side tint). */
  owned?: boolean
  /** The combatant whose turn it is — a gold ring (over the side/owned tint). */
  acting?: boolean
  /** A badge after the name — e.g. the combat acting/engaged sword. */
  trailing?: ReactNode
}) {
  // owned and acting are independent: your own character can be the acting
  // combatant, so it gets the gold tint *and* the gold ring.
  const tint = owned ? TOKEN_OWNED_STYLE : TOKEN_SIDE_STYLES[side]
  const ring = acting ? TOKEN_ACTING_RING : undefined
  return (
    <span
      data-side={side}
      className={cn(
        "inline-flex max-w-[10rem] flex-col gap-1 border px-1.5 py-1",
        tint.chip,
        ring
      )}
    >
      <span className="flex items-center gap-1.5">
        <TokenGlyph
          name={name}
          portraitUrl={portraitUrl}
          initialsClassName={tint.initials}
        />
        <span className={cn("truncate text-xs font-medium", tint.name)}>
          {name}
        </span>
        {trailing}
      </span>
      {hp ? <VitalBar current={hp.current} max={hp.max} kind="hp" /> : null}
      {sp ? <VitalBar current={sp.current} max={sp.max} kind="sp" /> : null}
    </span>
  )
}
