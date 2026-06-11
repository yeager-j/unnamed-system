"use client"

import { type PlayerVisibleCombatant } from "@workspace/game/engine"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"

import { useOwnCombatEvent } from "@/hooks/use-own-combat-event"

import { ConditionsControls } from "./conditions-controls"

/**
 * The watch view's **Combat State** card — the player's own live conditions. It
 * stands in for the character sheet's `CombatState`, because in combat a PC's
 * ailments / battle conditions are **session-overlay** state, not the character
 * row: it reads them off the player's redacted snapshot combatant and writes
 * them through {@link useOwnCombatEvent} (the player-scoped `applyOwnCombatEvent`
 * path), reusing the same {@link ConditionsControls} the DM drawer renders.
 *
 * Vitals (HP/SP) and the archetype mechanic are *not* here — those live on the
 * character row and are handled by the reused sheet components (`SheetHeader`,
 * `MechanicWidget`) in owner mode.
 */
export function PlayerCombatStateControl({
  shortId,
  snapshotVersion,
  combatant,
}: {
  shortId: string
  snapshotVersion: number
  combatant: PlayerVisibleCombatant
}) {
  const { dispatch, pending } = useOwnCombatEvent(shortId, snapshotVersion)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Combat State</CardTitle>
      </CardHeader>
      <CardContent className={cn(pending && "opacity-60")}>
        <ConditionsControls
          combatantId={combatant.id}
          battleConditions={combatant.battleConditions}
          conditionDurations={combatant.conditionDurations}
          ailments={combatant.ailments}
          onCombatEvent={dispatch}
        />
      </CardContent>
    </Card>
  )
}
