"use client"

import { type Pool } from "@workspace/game/engine"

import { TokenChip } from "@/components/dungeon/canvas/token-chip"

/**
 * An **enemy** token on the player battlefield (UNN-467) — the redacted combat peer
 * of {@link import("@/components/dungeon/canvas/explore/token-chip").DungeonTokenChip}.
 * The {@link TokenChip} shell with the enemy (red) side tint and an HP bar only; the
 * snapshot carries HP alone (the combat-watch redaction, UNN-324), so there's no SP
 * bar and no portrait.
 */
export function WatchEnemyChip({
  name,
  hp,
  acting = false,
}: {
  name: string
  hp: Pool
  /** The acting combatant's gold ring (an enemy can be acting on the watch board). */
  acting?: boolean
}) {
  return (
    <TokenChip
      side="enemies"
      name={name}
      portraitUrl={null}
      hp={hp}
      acting={acting}
    />
  )
}
