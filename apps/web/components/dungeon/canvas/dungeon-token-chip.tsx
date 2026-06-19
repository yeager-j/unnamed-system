"use client"

import { cn } from "@workspace/ui/lib/utils"

import { TokenGlyph } from "./token-glyph"

/**
 * A party-member chip inside a Zone card — a PC's spatial presence on the dungeon
 * canvas. Shared by the DM run console's
 * {@link import("./dungeon-zone-node").DungeonZoneNode} and the player fog view's
 * {@link import("./dungeon-fog-zone-node").DungeonFogZoneNode} so the two views of
 * the same token can't drift. PC-only in exploration, so it always carries the
 * player side-tint (square portrait/initials + a blue border).
 *
 * When `owned` is set — the fog view, for the signed-in viewer's own character — it
 * gains a primary self-highlight ring + a star (the self-identifying treatment,
 * ADR *Player view*). The DM console leaves it unset.
 */
export function DungeonTokenChip({
  name,
  portraitUrl,
  owned = false,
}: {
  name: string
  portraitUrl: string | null
  owned?: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-[10rem] items-center gap-1.5 border border-blue-700 bg-blue-100 py-1 pr-2 pl-1",
        "dark:border-blue-400 dark:bg-blue-950",
        owned &&
          "border-yellow-700 bg-yellow-100 dark:border-yellow-400 dark:bg-yellow-950"
      )}
    >
      <TokenGlyph
        name={name}
        portraitUrl={portraitUrl}
        portraitClassName="ring-1 ring-primary/40"
        initialsClassName="bg-primary/10 text-primary ring-1 ring-primary/40"
      />
      <span className="truncate text-xs font-medium text-blue-950 dark:text-blue-100">
        {name}
      </span>
    </span>
  )
}
