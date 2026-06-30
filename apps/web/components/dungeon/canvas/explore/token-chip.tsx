"use client"

import { type Pool } from "@workspace/game/engine"

import { TokenChip } from "@/components/dungeon/canvas/token-chip"

/**
 * A party-member chip inside a Zone card — a PC's spatial presence on the dungeon
 * canvas. Shared by the DM run console's
 * {@link import("@/components/dungeon/canvas/explore/zone-node").DungeonZoneNode} and the
 * player watch view's
 * {@link import("@/components/dungeon/canvas/watch/zone-node").DungeonWatchZoneNode} so the
 * two views of the same token can't drift. PC-only in exploration, so it always
 * carries the player side-tint.
 *
 * When `owned` is set — the watch view, for the signed-in viewer's own character —
 * it gains the `owned` highlight (the self-identifying treatment, ADR *Player
 * view*). The DM console leaves it unset. Side tint, glyph, and vitals come from the
 * shared {@link TokenChip}.
 */
export function DungeonTokenChip({
  name,
  portraitUrl,
  hp,
  sp,
  owned = false,
  acting = false,
}: {
  name: string
  portraitUrl: string | null
  hp?: Pool
  sp?: Pool | null
  owned?: boolean
  /** Combat only (the watch battlefield) — the acting combatant's gold ring. */
  acting?: boolean
}) {
  return (
    <TokenChip
      side="players"
      name={name}
      portraitUrl={portraitUrl}
      hp={hp}
      sp={sp}
      owned={owned}
      acting={acting}
    />
  )
}
