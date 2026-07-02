"use client"

import { CheckIcon, MapPinIcon } from "@phosphor-icons/react/dist/ssr"

import { getAilment } from "@workspace/game/data"
import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"

import { VitalBar } from "@/components/shared/vital-bar"
import type { WatchCombatant } from "@/lib/combat/view/watch-layout"

/**
 * The watch view's **Enemies** rail — the redacted enemy roster pinned to the
 * bottom of the battlefield column. One card per enemy combatant showing only
 * what a player may see (UNN-324): name, current zone, an unlabeled HP bar
 * (proportion, no numbers), its ailments, and whether it has acted this round.
 * No attributes/affinities reach the client, so there is nothing here to redact.
 *
 * It grows as the list wraps to more rows (up to a cap, then scrolls internally),
 * which shortens the zone map above it — the battlefield yields space to the
 * roster rather than the whole column scrolling as one.
 */
export function WatchEnemiesRail({
  enemies,
  zoneNameById,
}: {
  enemies: WatchCombatant[]
  zoneNameById: Map<string, string>
}) {
  return (
    <section className="flex max-h-[45%] shrink-0 flex-col border-t">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pt-3">
        <h2 className="font-heading text-lg font-medium">Enemies</h2>
        <p className="text-xs text-muted-foreground">
          grayed out = already acted this round
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-2 overflow-y-auto p-4 pt-2 sm:grid-cols-2 xl:grid-cols-3">
        {enemies.map((enemy) => (
          <li key={enemy.id}>
            <EnemyCard
              enemy={enemy}
              zoneName={
                enemy.zoneId ? (zoneNameById.get(enemy.zoneId) ?? null) : null
              }
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** One redacted enemy: name + acted ✓ + HP bar on top, location + ailments below.
 *  A red left accent reads "enemy"; an acted combatant dims. */
function EnemyCard({
  enemy,
  zoneName,
}: {
  enemy: WatchCombatant
  zoneName: string | null
}) {
  return (
    <div
      className={cn(
        "flex h-full flex-col gap-1.5 border border-l-2 border-l-destructive p-2.5",
        enemy.isCurrent && "border-l-4",
        enemy.hasActed && "opacity-50"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {enemy.name}
        </span>
        {enemy.hasActed ? (
          <CheckIcon
            aria-label="has acted"
            className="size-4 shrink-0 text-muted-foreground"
          />
        ) : null}
        {enemy.hp ? (
          <div className="w-20 shrink-0">
            <VitalBar current={enemy.hp.current} max={enemy.hp.max} kind="hp" />
          </div>
        ) : null}
      </div>

      {zoneName || enemy.ailments.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {zoneName ? (
            <span className="flex items-center gap-1">
              <MapPinIcon aria-hidden className="size-3.5" />
              {zoneName}
            </span>
          ) : null}
          {enemy.ailments.map((key) => (
            <Badge
              key={key}
              variant="outline"
              className="border-destructive/30 text-destructive"
            >
              {getAilment(key)?.name ?? key}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  )
}
