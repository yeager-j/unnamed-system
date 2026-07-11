"use client"

import { SwordIcon } from "@phosphor-icons/react/dist/ssr"
import { type ReactNode } from "react"

import { Badge } from "@workspace/ui/components/badge"

/**
 * The dashed-red frame + "Engaged" {@link Badge} that rings a Zone's melee-locked
 * cluster (rulebook §3.5) on the player fog map
 * ({@link import("@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/watch/zone-node").DungeonWatchZoneNode}).
 * The badge sits astride the top
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
