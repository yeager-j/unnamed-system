"use client"

import { SwordIcon } from "@phosphor-icons/react/dist/ssr"

import { TokenStatsPopover } from "@/components/combat/token-stats-popover"
import { OccupantToken } from "@/components/shared/canvas/set-piece/occupant-chips"
import type { WatchCombatant } from "@/domain/combat/view/watch-layout"
import type { SetPieceOccupant } from "@/domain/map/view/set-piece-view"

/**
 * A player-watch roster token — the read-only chip shared by the fog board's
 * Closeup grid and the crowded-zone roster inspector (§D7), so a zone that
 * degrades to the inspector keeps the same {@link TokenStatsPopover} (numeric
 * HP/SP, and in combat the ailments / battle-conditions from its
 * {@link WatchCombatant}) it shows in-card. Pass the matching `combatant` in
 * combat mode; omit it during exploration.
 */
export function WatchRosterToken({
  occupant,
  combatant,
}: {
  occupant: SetPieceOccupant
  combatant?: WatchCombatant
}) {
  return (
    <TokenStatsPopover
      name={occupant.name}
      hp={occupant.hp ?? null}
      sp={occupant.sp ?? null}
      conditions={
        combatant
          ? {
              ailments: combatant.ailments,
              battleConditions: combatant.battleConditions,
              conditionDurations: combatant.conditionDurations,
            }
          : undefined
      }
    >
      <OccupantToken
        occupant={occupant}
        trailing={
          occupant.acting ? (
            <SwordIcon weight="fill" className="size-3 shrink-0" aria-hidden />
          ) : null
        }
      />
    </TokenStatsPopover>
  )
}
