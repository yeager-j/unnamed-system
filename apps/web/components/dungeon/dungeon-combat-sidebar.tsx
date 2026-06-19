"use client"

import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import { type RosterView } from "@workspace/game/engine"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
} from "@workspace/ui/components/sidebar"

import { CombatantRail } from "@/components/combat/combatant-rail"

/**
 * The run console's left panel during **combat** (UNN-467) — the Party panel
 * morphed to **Combatants**. It keeps the exploration sidebar's shell (back link +
 * delve name) and adds the Round badge, then renders the shared
 * {@link CombatantRail} (PLAYERS / ENEMIES groups with HP/SP, the acting combatant
 * highlighted, the Downed rollup). Tapping a row opens the detail drawer.
 */
export function DungeonCombatSidebar({
  roster,
  dungeonName,
  campaignShortId,
  round,
  onSelectCombatant,
  ...props
}: {
  roster: RosterView
  dungeonName: string
  campaignShortId: string
  round: number
  onSelectCombatant: (combatantId: string) => void
} & Omit<React.ComponentProps<typeof Sidebar>, "onSelect">) {
  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader className="gap-4">
        <div className="flex items-center gap-2">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Back to campaign"
            nativeButton={false}
            render={<Link href={`/campaigns/${campaignShortId}`} />}
          >
            <ArrowLeftIcon />
          </Button>
          <h1 className="min-w-0 flex-1 truncate font-heading text-base font-semibold">
            {dungeonName}
          </h1>
          <Badge variant="outline" className="shrink-0 tabular-nums">
            Round {round}
          </Badge>
        </div>
        <Separator />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <CombatantRail roster={roster} onSelect={onSelectCombatant} />
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
