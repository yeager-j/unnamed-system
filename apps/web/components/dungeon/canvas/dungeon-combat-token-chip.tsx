"use client"

import { SwordIcon } from "@phosphor-icons/react/dist/ssr"
import Image from "next/image"

import type { ZoneToken } from "@workspace/game/engine"
import { cn } from "@workspace/ui/lib/utils"

import { initials } from "@/lib/ui/initials"

/**
 * A combatant chip inside a combat zone card — the combat peer of the exploration
 * {@link import("./dungeon-token-chip").DungeonTokenChip}. Side-tinted (players
 * blue, enemies destructive-red — never color alone: the side also drives the
 * portrait-vs-initials glyph and the acting ring), PC tokens draw their portrait,
 * enemies a side-colored initials square. The **acting** token gains a primary
 * ring + a sword badge (the same "acting" treatment its rail row shows).
 *
 * Presentational only (serializable props) — the
 * {@link import("./dungeon-combat-zone-node").DungeonCombatZoneNode} owns the
 * tap-to-open-drawer interaction through its context, mirroring how
 * {@link DungeonTokenChip} stays callback-free.
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
    <span
      data-side={token.side}
      className={cn(
        "inline-flex max-w-[10rem] items-center gap-1.5 border py-1 pr-2 pl-1",
        token.side === "players"
          ? "border-blue-700 bg-blue-100 text-blue-950 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-100"
          : "border-red-700 bg-red-100 text-red-950 dark:border-red-400 dark:bg-red-950 dark:text-red-100",
        acting && "ring-2 ring-primary ring-offset-1 ring-offset-card"
      )}
    >
      {token.isPc && token.portraitUrl ? (
        <Image
          src={token.portraitUrl}
          alt=""
          width={20}
          height={20}
          className="size-5 shrink-0 object-cover"
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            "flex size-5 shrink-0 items-center justify-center text-[9px] font-semibold",
            token.side === "players"
              ? "bg-blue-200 text-blue-900 dark:bg-blue-900 dark:text-blue-100"
              : "bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100"
          )}
        >
          {initials(token.name, "?")}
        </span>
      )}
      <span className="truncate text-xs font-medium">{token.name}</span>
      {acting ? (
        <SwordIcon weight="fill" className="size-3 shrink-0" aria-hidden />
      ) : isEngaged ? (
        <SwordIcon
          className="size-3 shrink-0 opacity-60"
          aria-label="Engaged"
        />
      ) : null}
    </span>
  )
}
