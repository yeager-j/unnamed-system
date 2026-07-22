"use client"

import { ArrowLeftIcon, UsersIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { getEnemy } from "@workspace/game-v2/catalog/enemies"
import { resolveFirstSide } from "@workspace/game-v2/encounter"
import type {
  CombatAdvantage,
  CombatSide,
} from "@workspace/game-v2/kernel/vocab/combat"
import type { Canon } from "@workspace/headcanon"
import { DataSelect } from "@workspace/ui/components/data-select"
import { Separator } from "@workspace/ui/components/separator"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"

import { useDungeonEnemyQueue } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_hooks/use-dungeon-enemy-queue"
import { SideToggle } from "@/components/combat/controls/side-toggle"
import { EnemyCatalogPanel } from "@/components/combat/enemies/enemy-catalog-panel"
import { EnemyQueueRail } from "@/components/combat/enemies/enemy-queue-rail"
import {
  dungeonCommand,
  type DungeonCanonValue,
} from "@/domain/dungeon/commit/protocol"
import { useDungeonPredictions } from "@/domain/dungeon/use-dungeon-predictions"
import {
  COMBAT_ADVANTAGE_COMPACT_LABELS,
  COMBAT_ADVANTAGE_SETUP_HINTS,
  COMBAT_AMBUSH_HEADING,
  COMBAT_FIRST_SIDE_HEADING,
} from "@/domain/labels"
import { dungeonErrorMessage } from "@/lib/actions/dungeon/error-message"
import { dungeonConsolePath } from "@/lib/paths"

const ADVANTAGE_ORDER: readonly CombatAdvantage[] = [
  "players",
  "neutral",
  "enemies",
]

export interface StagingZone {
  id: string
  name: string
  /** The page grouping the zone picker renders under (UNN-586). */
  pageId: string
  pageName: string
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
 * first side, and Begins: one atomic `dungeon.command` mints an
 * already-live encounter, co-minting the staged enemies onto the delve's existing
 * geometry with the party's exploration tokens carried into the fight. Back on the
 * console, the route re-forks to combat.
 */
export function DungeonEncounterStaging({
  dungeonId,
  shortId,
  campaignShortId,
  dungeonName,
  canon,
  partyCharacterIds,
  zones,
}: {
  dungeonId: string
  shortId: string
  campaignShortId: string
  dungeonName: string
  canon: Canon<DungeonCanonValue>
  partyCharacterIds: string[]
  zones: StagingZone[]
}) {
  const router = useRouter()
  const root = useDungeonPredictions({ canon })
  const isPending = root.status.pending > 0
  const queue = useDungeonEnemyQueue(dungeonId)

  const [dropZoneId, setDropZoneId] = useState(() => zones[0]?.id ?? "")
  const [advantage, setAdvantage] = useState<CombatAdvantage>("neutral")
  const [neutralFirstSide, setNeutralFirstSide] =
    useState<CombatSide>("players")

  const zoneNameById = new Map(zones.map((zone) => [zone.id, zone.name]))
  // A zone the DM deleted while the queue sat in localStorage stages nothing.
  const staged = queue.queue.filter((entry) => zoneNameById.has(entry.zoneId))
  const stagedCount = staged.reduce((sum, entry) => sum + entry.count, 0)

  const backHref = dungeonConsolePath(campaignShortId, shortId)

  /** The list's `+` can't disable itself — the panel is queue-blind by design — so
   *  an add onto a full group says why it did nothing rather than no-opping. */
  function stage(enemyKey: string) {
    const group = staged.find(
      (entry) => entry.enemyKey === enemyKey && entry.zoneId === dropZoneId
    )
    if (group && group.count >= queue.maxCount) {
      toast.warning(
        `${enemyName(enemyKey)} is capped at ${queue.maxCount} per zone.`
      )
      return
    }
    queue.add(enemyKey, dropZoneId)
  }

  function returnToConsole() {
    queue.clear()
    router.push(backHref)
  }

  function begin() {
    const result = root.mutate(
      dungeonCommand({
        dungeonId,
        command: {
          kind: "startEncounter",
          name: dungeonName.trim() || "Encounter",
          advantage,
          firstSide: resolveFirstSide(advantage, neutralFirstSide),
          partyCharacterIds,
          enemies: staged,
        },
      })
    )
    if (!result.ok) {
      toast.error(dungeonErrorMessage(result.error))
      return
    }
    void result.value.accepted.then((accepted) => {
      if (accepted.ok) {
        queue.clear()
        router.push(backHref)
        router.refresh()
        return
      }
      if (
        accepted.error.kind === "domain" ||
        accepted.error.kind === "replay-refused"
      ) {
        toast.error(dungeonErrorMessage(accepted.error.error))
      }
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
        onAdd={stage}
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
            maxCount={queue.maxCount}
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
              neutralFirstSide={neutralFirstSide}
              onNeutralFirstSideChange={setNeutralFirstSide}
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
  return (
    <div className="flex items-center gap-2">
      {prefix ? (
        <span className="text-xs text-muted-foreground">{prefix}</span>
      ) : null}
      {/* Zones grouped by page (UNN-586); DataSelect shows headings only when
          the map has >1 page. */}
      <DataSelect
        size="sm"
        className="flex-1"
        aria-label={label}
        placeholder="Zone"
        options={zones}
        optionValue={(zone) => zone.id}
        optionLabel={(zone) => zone.name}
        optionGroup={(zone) => ({ key: zone.pageId, label: zone.pageName })}
        value={value}
        onValueChange={(next) => onChange(next || value)}
      />
    </div>
  )
}

/** The opening declaration: who ambushes, and — only when nobody does — who leads.
 *  `neutralFirstSide` is the DM's pick for that case, not the resolved first side
 *  (`resolveFirstSide` decides that at commit). */
function AdvantageControls({
  advantage,
  onAdvantageChange,
  neutralFirstSide,
  onNeutralFirstSideChange,
}: {
  advantage: CombatAdvantage
  onAdvantageChange: (advantage: CombatAdvantage) => void
  neutralFirstSide: CombatSide
  onNeutralFirstSideChange: (side: CombatSide) => void
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
          <SideToggle
            side={neutralFirstSide}
            onChange={onNeutralFirstSideChange}
          />
        </div>
      ) : null}
    </div>
  )
}
