import type {
  PlayerView,
  PlayerVisibleCombatant,
} from "@workspace/game/encounter"

import { PlayerCombatantCard } from "./player-combatant-card"

/**
 * The watch view's **zone map** (UNN-322): the combatant state cards grouped by
 * the zone each stands in, so "who is where" and "how they're doing" read as one
 * surface. One labelled section per zone (in zone order) plus an `Unplaced`
 * section for combatants whose zone is unknown. An unzoned encounter (theater of
 * mind) collapses to a single `Battlefield` group. Pure read display.
 */
export function PlayerZoneMap({ view }: { view: PlayerView }) {
  if (!view.hasZones) {
    return <ZoneSection title="Battlefield" combatants={view.unplaced} />
  }

  return (
    <div className="flex flex-col gap-6">
      {view.zones.map((group) => (
        <ZoneSection
          key={group.zone.id}
          title={group.zone.name}
          combatants={group.combatants}
        />
      ))}
      {view.unplaced.length > 0 ? (
        <ZoneSection title="Unplaced" combatants={view.unplaced} />
      ) : null}
    </div>
  )
}

function ZoneSection({
  title,
  combatants,
}: {
  title: string
  combatants: PlayerVisibleCombatant[]
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-heading text-sm font-medium text-muted-foreground">
        {title}
        <span className="ml-2 text-xs tabular-nums">{combatants.length}</span>
      </h3>
      {combatants.length === 0 ? (
        <p className="text-sm text-muted-foreground">Empty</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {combatants.map((combatant) => (
            <PlayerCombatantCard key={combatant.id} combatant={combatant} />
          ))}
        </div>
      )}
    </section>
  )
}
