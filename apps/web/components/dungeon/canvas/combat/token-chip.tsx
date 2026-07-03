"use client"

import { SwordIcon } from "@phosphor-icons/react/dist/ssr"

import { TokenChip } from "@/components/dungeon/canvas/token-chip"

import type { DungeonCombatToken } from "./zone-node"

/**
 * A combatant chip inside a combat zone card (UNN-536) — the shared
 * {@link TokenChip} shell plus the combat extras: the **acting** token gains the
 * gold acting ring and a filled sword badge; a merely **engaged** token shows a
 * dimmed sword. Side tint, glyph, and vital bars all come from the shell. A PC
 * shows its portrait; an enemy falls back to initials.
 *
 * Presentational only — the {@link import("./zone-node").DungeonCombatZoneNode}
 * owns the tap-to-open-drawer interaction through its context.
 */
export function DungeonCombatTokenChip({
  token,
  acting,
}: {
  token: DungeonCombatToken
  acting: boolean
}) {
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
        ) : token.engaged ? (
          <SwordIcon
            className="size-3 shrink-0 opacity-60"
            aria-label="Engaged"
          />
        ) : null
      }
    />
  )
}
