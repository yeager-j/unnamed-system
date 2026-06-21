"use client"

import { SwordIcon } from "@phosphor-icons/react/dist/ssr"
import { type ReactNode } from "react"

import { Badge } from "@workspace/ui/components/badge"

/**
 * The dashed-red frame + "Engaged" {@link Badge} that rings a Zone's melee-locked
 * cluster (rulebook §3.5) — shared by the DM battlefield
 * ({@link import("@/components/dungeon/canvas/combat/zone-node").DungeonCombatZoneNode}) and the
 * player fog map ({@link import("@/components/dungeon/canvas/watch/zone-node").DungeonWatchZoneNode}) so
 * the two views of the same lock can't drift. The badge sits astride the top
 * border like a fieldset legend; the cluster's top padding reserves room for it,
 * since it's absolutely positioned. The visible label stays the literal word
 * "Engaged" while the group's accessible name (`label`) carries the member names.
 */
export function EngagedCluster({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="relative mt-2 flex flex-wrap gap-1.5 border-2 border-dashed border-destructive p-1.5 pt-4"
    >
      <Badge
        variant="engaged"
        className="pointer-events-none absolute -top-[11px]"
      >
        Engaged
        <SwordIcon />
      </Badge>
      {children}
    </div>
  )
}
