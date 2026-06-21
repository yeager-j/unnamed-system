"use client"

import { type RosterView } from "@workspace/game/engine"
import { Badge } from "@workspace/ui/components/badge"
import { SidebarContent, SidebarGroup } from "@workspace/ui/components/sidebar"

import { CombatantRail } from "@/components/combat/combatant-rail"
import { DungeonSidebarHeader } from "@/components/dungeon/shell/sidebar-header"

/**
 * The run console's left panel during **combat** (UNN-467) — the Party panel
 * morphed to **Combatants**, portaled into the persistent
 * {@link import("@/components/dungeon/shell/console-shell").DungeonConsoleShell}'s shared `<Sidebar>`
 * (UNN-488). It keeps the exploration sidebar's header (back link + delve name) and
 * adds the Round badge, then renders the shared {@link CombatantRail} (PLAYERS /
 * ENEMIES groups with HP/SP, the acting combatant highlighted, the Downed rollup).
 * Tapping a row opens the detail drawer.
 */
export function DungeonCombatSidebar({
  roster,
  dungeonName,
  campaignShortId,
  round,
  onSelectCombatant,
}: {
  roster: RosterView
  dungeonName: string
  campaignShortId: string
  round: number
  onSelectCombatant: (combatantId: string) => void
}) {
  return (
    <>
      <DungeonSidebarHeader
        dungeonName={dungeonName}
        campaignShortId={campaignShortId}
        trailing={
          <Badge variant="outline" className="shrink-0 tabular-nums">
            Round {round}
          </Badge>
        }
      />

      <SidebarContent>
        <SidebarGroup>
          <CombatantRail roster={roster} onSelect={onSelectCombatant} />
        </SidebarGroup>
      </SidebarContent>
    </>
  )
}
