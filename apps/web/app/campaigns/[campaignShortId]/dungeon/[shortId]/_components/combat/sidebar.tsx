"use client"

import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { Badge } from "@workspace/ui/components/badge"
import { Label } from "@workspace/ui/components/label"
import { SidebarContent, SidebarGroup } from "@workspace/ui/components/sidebar"
import { Switch } from "@workspace/ui/components/switch"

import { useDungeonCombatCanvas } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/combat/context"
import { DungeonSidebarHeader } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/shell/sidebar-header"
import { CombatantRail } from "@/components/combat/rail/combatant-rail"
import { TurnOrderStrip } from "@/components/combat/turn-order-strip"
import type { RosterView } from "@/domain/combat/view/roster-view"

/**
 * The run console's left panel during **combat** (UNN-536) — the Party panel
 * morphed to **Combatants**, portaled into the persistent
 * {@link import("@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/shell/console-shell").DungeonConsoleShell}'s
 * shared `<Sidebar>` (UNN-488). It keeps the exploration sidebar's header (back
 * link + delve name) and adds the Round badge, then renders the shared
 * {@link CombatantRail} (PLAYERS / ENEMIES groups with HP/SP, the acting combatant
 * highlighted, the Downed rollup). Tapping a row opens the detail drawer.
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
  onSelectCombatant: (participantId: ParticipantId) => void
}) {
  const {
    phase,
    draftHeading,
    actingName,
    turnRows,
    roundComplete,
    onDraft,
    onAdvanceRound,
    moveAnywhere,
    onToggleMoveAnywhere,
    disabled,
  } = useDungeonCombatCanvas()

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
        <SidebarGroup className="gap-2">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h2 className="font-heading text-sm font-medium">
              {phase === "drafting"
                ? draftHeading
                : phase === "resolving"
                  ? "Resolving end-of-turn checks…"
                  : `Now acting: ${actingName}`}
            </h2>
            {phase === "active" ? (
              <Label className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                <Switch
                  checked={moveAnywhere}
                  onCheckedChange={onToggleMoveAnywhere}
                  disabled={disabled}
                />
                Move anywhere
              </Label>
            ) : null}
          </div>
          <TurnOrderStrip
            rows={turnRows}
            phase={phase}
            round={round}
            roundComplete={roundComplete}
            isPending={disabled}
            onDraft={onDraft}
            onAdvanceRound={onAdvanceRound}
          />
        </SidebarGroup>

        <SidebarGroup>
          <CombatantRail roster={roster} onSelect={onSelectCombatant} />
        </SidebarGroup>
      </SidebarContent>
    </>
  )
}
