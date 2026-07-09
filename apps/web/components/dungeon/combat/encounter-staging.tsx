"use client"

import { ArrowLeftIcon, UsersIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { getEnemy } from "@workspace/game-v2/catalog/enemies"
import type {
  CombatAdvantage,
  CombatSide,
} from "@workspace/game-v2/kernel/vocab/combat"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Separator } from "@workspace/ui/components/separator"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"

import { SideToggle } from "@/components/combat/controls/side-toggle"
import { EnemyCatalogPanel } from "@/components/combat/enemies/enemy-catalog-panel"
import { EnemyQueueRail } from "@/components/combat/enemies/enemy-queue-rail"
import { useDungeonEnemyQueue } from "@/hooks/use-dungeon-enemy-queue"
import { dungeonErrorMessage } from "@/lib/actions/dungeon/error-message"
import { startDungeonEncounterAction } from "@/lib/actions/dungeon/start-encounter"
import {
  COMBAT_ADVANTAGE_COMPACT_LABELS,
  COMBAT_ADVANTAGE_SETUP_HINTS,
  COMBAT_AMBUSH_HEADING,
  COMBAT_FIRST_SIDE_HEADING,
} from "@/lib/ui/labels"

const ADVANTAGE_ORDER: readonly CombatAdvantage[] = [
  "players",
  "neutral",
  "enemies",
]

export interface StagingZone {
  id: string
  name: string
}

function enemyName(enemyKey: string): string {
  return getEnemy(enemyKey)?.components.identity?.name ?? enemyKey
}

/**
 * The delve's **pre-combat staging** surface (UNN-536, on the shared bestiary
 * since UNN-541) — the client-side twin of the mapless encounter's browse route.
 * The DM browses the full catalog through {@link EnemyCatalogPanel}, drops
 * creatures into a zone (nothing persists — the queue is localStorage, keyed by
 * dungeon id, since no encounter exists yet), declares the opening advantage +
 * first side, and Begins: one atomic {@link startDungeonEncounterAction} mints an
 * already-live encounter, co-minting the staged enemies onto the delve's existing
 * geometry with the party's exploration tokens carried into the fight. Back on the
 * console, the route re-forks to combat.
 */
export function DungeonEncounterStaging({
  dungeonId,
  shortId,
  dungeonName,
  expectedInstanceVersion,
  partyCharacterIds,
  zones,
}: {
  dungeonId: string
  shortId: string
  dungeonName: string
  expectedInstanceVersion: number
  partyCharacterIds: string[]
  zones: StagingZone[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const queue = useDungeonEnemyQueue(dungeonId)

  const [dropZoneId, setDropZoneId] = useState(() => zones[0]?.id ?? "")
  const [advantage, setAdvantage] = useState<CombatAdvantage>("neutral")
  const [firstSide, setFirstSide] = useState<CombatSide>("players")

  const zoneNameById = new Map(zones.map((zone) => [zone.id, zone.name]))
  // A zone the DM deleted while the queue sat in localStorage stages nothing.
  const staged = queue.queue.filter((entry) => zoneNameById.has(entry.zoneId))
  const stagedCount = staged.reduce((sum, entry) => sum + entry.count, 0)

  const backHref = `/dungeon/${shortId}`

  function returnToConsole() {
    queue.clear()
    router.push(backHref)
  }

  function begin() {
    startTransition(async () => {
      const result = await startDungeonEncounterAction({
        dungeonId,
        expectedInstanceVersion,
        name: dungeonName.trim() || "Encounter",
        advantage,
        firstSide: advantage === "neutral" ? firstSide : advantage,
        partyCharacterIds,
        enemies: staged,
      })

      if (!result.ok) {
        toast.error(dungeonErrorMessage(result.error))
        return
      }

      queue.clear()
      router.push(backHref)
      router.refresh()
    })
  }

  return (
    <main className="flex flex-col lg:h-[calc(100svh-3.5rem)] lg:overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b px-6 py-4">
        <div className="min-w-0">
          <Link
            href={backHref}
            className="mb-1 flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon aria-hidden /> Back to the delve
          </Link>
          <h1 className="font-heading text-2xl font-medium">
            Start an encounter
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Browse the bestiary and drop creatures into the delve&apos;s zones.
            The party fights where it stands — nothing is written until you
            begin.
          </p>
        </div>
        <div className="flex items-center gap-6 border px-4 py-2.5">
          <div>
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              Delve
            </p>
            <p className="font-heading text-sm font-medium">{dungeonName}</p>
          </div>

          <Separator orientation="vertical" />

          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <UsersIcon className="size-4" /> {partyCharacterIds.length}
          </span>
        </div>
      </header>

      <EnemyCatalogPanel
        onAdd={(enemyKey) => queue.add(enemyKey, dropZoneId)}
        rail={
          <EnemyQueueRail
            items={staged.map((entry) => ({
              id: queue.entryId(entry),
              name: enemyName(entry.enemyKey),
              count: entry.count,
              qualifier: zoneNameById.get(entry.zoneId),
              detail: (
                <ZoneSelect
                  value={entry.zoneId}
                  zones={zones}
                  label={`Zone for ${enemyName(entry.enemyKey)} in ${zoneNameById.get(entry.zoneId)}`}
                  onChange={(zoneId) =>
                    queue.setZone(queue.entryId(entry), zoneId)
                  }
                />
              ),
            }))}
            totalCount={stagedCount}
            isPending={isPending}
            commitLabel="Begin encounter"
            headerAccessory={
              <ZoneSelect
                value={dropZoneId}
                zones={zones}
                label="Drop creatures into"
                onChange={setDropZoneId}
                prefix="Drop into"
              />
            }
            onIncrement={(id) => {
              const entry = staged.find((item) => queue.entryId(item) === id)
              queue.setCount(id, (entry?.count ?? 0) + 1)
            }}
            onDecrement={(id) => {
              const entry = staged.find((item) => queue.entryId(item) === id)
              queue.setCount(id, (entry?.count ?? 0) - 1)
            }}
            onRemove={queue.remove}
            onCommit={begin}
            onCancel={returnToConsole}
          >
            <AdvantageControls
              advantage={advantage}
              onAdvantageChange={setAdvantage}
              firstSide={firstSide}
              onFirstSideChange={setFirstSide}
            />
          </EnemyQueueRail>
        }
      />
    </main>
  )
}

function ZoneSelect({
  value,
  zones,
  label,
  prefix,
  onChange,
}: {
  value: string
  zones: StagingZone[]
  label: string
  prefix?: string
  onChange: (zoneId: string) => void
}) {
  const zoneNameById = new Map(zones.map((zone) => [zone.id, zone.name]))

  return (
    <div className="flex items-center gap-2">
      {prefix ? (
        <span className="text-xs text-muted-foreground">{prefix}</span>
      ) : null}
      <Select value={value} onValueChange={(next) => onChange(next ?? value)}>
        <SelectTrigger size="sm" className="flex-1" aria-label={label}>
          <SelectValue>
            {(selected) =>
              selected ? (zoneNameById.get(String(selected)) ?? "Zone") : "Zone"
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {zones.map((zone) => (
            <SelectItem key={zone.id} value={zone.id}>
              {zone.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function AdvantageControls({
  advantage,
  onAdvantageChange,
  firstSide,
  onFirstSideChange,
}: {
  advantage: CombatAdvantage
  onAdvantageChange: (advantage: CombatAdvantage) => void
  firstSide: CombatSide
  onFirstSideChange: (side: CombatSide) => void
}) {
  return (
    <div className="mb-3 flex flex-col gap-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">{COMBAT_AMBUSH_HEADING}</span>
        <ToggleGroup
          aria-label={COMBAT_AMBUSH_HEADING}
          variant="outline"
          size="sm"
          value={[advantage]}
          onValueChange={(value) => {
            const next = value[0] as CombatAdvantage | undefined
            if (next) onAdvantageChange(next)
          }}
        >
          {ADVANTAGE_ORDER.map((option) => (
            <ToggleGroupItem
              key={option}
              value={option}
              title={COMBAT_ADVANTAGE_SETUP_HINTS[option]}
            >
              {COMBAT_ADVANTAGE_COMPACT_LABELS[option]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {advantage === "neutral" ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">
            {COMBAT_FIRST_SIDE_HEADING}
          </span>
          <SideToggle side={firstSide} onChange={onFirstSideChange} />
        </div>
      ) : null}
    </div>
  )
}
