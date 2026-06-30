"use client"

import { SwordIcon } from "@phosphor-icons/react/dist/ssr"

import type { ZoneToken } from "@workspace/game/engine"

import { TokenChip } from "@/components/dungeon/canvas/token-chip"

/**
 * A combatant chip inside a combat zone card — the {@link TokenChip} shell with the
 * combat extras: the **acting** token gains the gold acting ring (the highlight) and
 * a filled sword badge; a merely **engaged** token shows a dimmed sword. Side tint,
 * glyph, and vital bars all come from the shared shell.
 *
 * Presentational only — the
 * {@link import("@/components/dungeon/canvas/combat/zone-node").DungeonCombatZoneNode}
 * owns the tap-to-open-drawer interaction through its context.
 */
export function DungeonCombatTokenChip({
  token,
  acting,
}: {
  token: ZoneToken
  acting: boolean
}) {
  const isEngaged = token.engagement?.status === "engaged"
  return (
    <TokenChip
      side={token.side}
      name={token.name}
      portraitUrl={token.isPc ? token.portraitUrl : null}
      hp={token.hp}
      sp={token.sp}
      acting={acting}
      trailing={
        acting ? (
          <SwordIcon weight="fill" className="size-3 shrink-0" aria-hidden />
        ) : isEngaged ? (
          <SwordIcon
            className="size-3 shrink-0 opacity-60"
            aria-label="Engaged"
          />
        ) : null
      }
    />
  )
}
