"use client"

import { CaretDoubleDownIcon } from "@phosphor-icons/react/dist/ssr"

import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"

import { CombatantRailRow } from "@/components/combat/rail/row"
import type { RailRow, RosterView } from "@/domain/combat/view/roster-view"
import { COMBAT_SIDE_LABELS } from "@/lib/ui/labels"

/**
 * The console's left **combatant rail** (UNN-345): PLAYERS and ENEMIES groups
 * with counts, each combatant a {@link CombatantRailRow}; the enemies group
 * carries the "N/M Downed" rollup. Tapping a row opens the detail drawer via
 * `onSelect`. Pure presentation over the {@link RosterView} the console shaped.
 */
export function CombatantRail({
  roster,
  onSelect,
}: {
  roster: RosterView
  onSelect: (participantId: ParticipantId) => void
}) {
  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 md:w-80">
      <h2 className="flex items-baseline justify-between gap-2 font-heading text-sm font-medium">
        Combatants
        <span className="text-xs font-normal text-muted-foreground">
          tap → detail
        </span>
      </h2>

      <Group
        title={COMBAT_SIDE_LABELS.players}
        count={roster.players.length}
        rows={roster.players}
        onSelect={onSelect}
      />

      <Group
        title={COMBAT_SIDE_LABELS.enemies}
        count={roster.enemyCount}
        rows={roster.enemies}
        onSelect={onSelect}
        rollup={
          roster.downedEnemyCount > 0 ? (
            <span className="flex items-center gap-1 text-xs font-normal text-destructive">
              <CaretDoubleDownIcon weight="bold" />
              {roster.downedEnemyCount}/{roster.enemyCount} Downed
            </span>
          ) : null
        }
      />
    </aside>
  )
}

function Group({
  title,
  count,
  rows,
  onSelect,
  rollup,
}: {
  title: string
  count: number
  rows: RailRow[]
  onSelect: (participantId: ParticipantId) => void
  rollup?: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center justify-between gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <span>
          {title} · {count}
        </span>
        {rollup}
      </h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">None.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <CombatantRailRow row={row} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
